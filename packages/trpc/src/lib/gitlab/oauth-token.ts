import { z } from "zod";
import { GitlabApiError } from "./api";
import { readGitlabConfig } from "./config";
import { assertGitLabOAuthOrigin } from "./oauth-origin";
import { safeGitLabFetch } from "./transport";

const rotatedTokenSchema = z.object({
	access_token: z
		.string()
		.min(1)
		.regex(/^[!-~]+$/),
	refresh_token: z
		.string()
		.min(1)
		.regex(/^[!-~]+$/),
	expires_in: z.number().finite().positive(),
});
export async function exchangeGitlabToken(
	connection: { state: unknown; refreshToken: string | null },
	credentials: {
		clientId: string | undefined;
		clientSecret: string | undefined;
		issuer?: string;
	},
	send = safeGitLabFetch,
): Promise<
	| { accessToken: string; refreshToken: string; tokenExpiresAt: Date }
	| { revoked: string }
> {
	const config = readGitlabConfig(connection.state);
	if (
		!config ||
		config.auth !== "oauth" ||
		!connection.refreshToken ||
		!credentials.clientId ||
		!credentials.clientSecret
	)
		return { revoked: "needs_reauth" };
	const origin = assertGitLabOAuthOrigin(
		`https://${config.host}`,
		credentials.issuer,
	);
	const response = await send(`${origin}/oauth/token`, {
		method: "POST",
		headers: { "Content-Type": "application/x-www-form-urlencoded" },
		body: new URLSearchParams({
			grant_type: "refresh_token",
			refresh_token: connection.refreshToken,
			client_id: credentials.clientId,
			client_secret: credentials.clientSecret,
		}),
	});
	const payload: unknown = await response.json().catch(() => null);
	if (!response.ok) {
		if (
			response.status < 500 &&
			payload &&
			typeof payload === "object" &&
			"error" in payload &&
			(payload.error === "invalid_grant" || payload.error === "invalid_client")
		)
			return { revoked: "needs_reauth" };
		throw new GitlabApiError(response.status, "/oauth/token");
	}
	return parseGitlabTokenResponse(payload);
}

export function parseGitlabTokenResponse(payload: unknown): {
	accessToken: string;
	refreshToken: string;
	tokenExpiresAt: Date;
} {
	const parsed = rotatedTokenSchema.safeParse(payload);
	if (!parsed.success) throw new GitlabApiError(502, "/oauth/token");
	const tokenExpiresAt = new Date(Date.now() + parsed.data.expires_in * 1000);
	if (!Number.isFinite(tokenExpiresAt.getTime()))
		throw new GitlabApiError(502, "/oauth/token");
	return {
		accessToken: parsed.data.access_token,
		refreshToken: parsed.data.refresh_token,
		tokenExpiresAt,
	};
}
