/**
 * A member's own GitHub account, connected through the GitHub App's user
 * authorization — a user-to-server token, not the org's installation.
 *
 * Why the App's user tokens and not a `repo`-scoped OAuth App: the token is
 * bounded by the installation's permissions ∩ the member's own access, so a
 * member can never do more through Superset than they could themselves, and
 * never more than the org granted the App. It expires (8h, refresh 6 months)
 * and can be revoked from either side. Sign-in's OAuth App (GH_CLIENT_*)
 * carries neither property, and "log in" must never silently mean "push as
 * me" — connecting is its own consent.
 */
import { db } from "@superset/db/client";
import { type GithubConfig, integrationConnections } from "@superset/db/schema";
import { withConnectionLock } from "@superset/db/utils";
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { env } from "../../../env";

/** Refresh anything that would expire this soon; a push takes a while. */
export const GITHUB_USER_TOKEN_REFRESH_BUFFER_MS = 5 * 60 * 1000;
const GITHUB_OAUTH_TIMEOUT_MS = 10 * 1000;

/**
 * GitHub answers the token endpoint with 200 for errors too, so the error
 * shape has to be part of the schema rather than a status check.
 */
export const githubUserTokenResponseSchema = z.union([
	z.object({
		access_token: z.string().min(1),
		token_type: z.string().optional(),
		scope: z.string().optional(),
		// Only when "Expire user authorization tokens" is on for the App. Off,
		// the token never expires and there is nothing to refresh; the row then
		// carries no expiry and is used as-is.
		expires_in: z.number().optional(),
		refresh_token: z.string().optional(),
		refresh_token_expires_in: z.number().optional(),
	}),
	z.object({
		error: z.string(),
		error_description: z.string().optional(),
	}),
]);
export type GithubUserTokenResponse = z.infer<
	typeof githubUserTokenResponseSchema
>;

export function githubConfigOf(config: unknown): GithubConfig | null {
	if (config && typeof config === "object" && "provider" in config) {
		const candidate = config as { provider?: string };
		if (candidate.provider === "github") return config as GithubConfig;
	}
	return null;
}

export function isGithubUserAuthConfigured(): boolean {
	return Boolean(env.GH_APP_CLIENT_ID && env.GH_APP_CLIENT_SECRET);
}

/** One member's active GitHub connection in an org, or null. */
export async function findGithubUserConnection(
	organizationId: string,
	userId: string,
) {
	const connection = await db.query.integrationConnections.findFirst({
		where: and(
			eq(integrationConnections.organizationId, organizationId),
			eq(integrationConnections.provider, "github"),
			eq(integrationConnections.connectedByUserId, userId),
			isNull(integrationConnections.disconnectedAt),
		),
	});
	return connection ?? null;
}

type RefreshResult =
	| { disconnected: true }
	| { disconnected: false; accessToken: string };

/**
 * Refreshes under the connection's advisory lock. GitHub's refresh tokens are
 * single-use — the response always carries a new one — so two concurrent
 * callers must never both spend the stored one, or the second is left with a
 * dead grant and the member has to reconnect for no reason.
 */
export async function refreshGithubUserToken(
	connectionId: string,
	options: { force?: boolean } = {},
): Promise<RefreshResult> {
	return withConnectionLock(connectionId, async (tx) => {
		const [connection] = await tx
			.select({
				accessToken: integrationConnections.accessToken,
				refreshToken: integrationConnections.refreshToken,
				tokenExpiresAt: integrationConnections.tokenExpiresAt,
				disconnectedAt: integrationConnections.disconnectedAt,
			})
			.from(integrationConnections)
			.where(eq(integrationConnections.id, connectionId))
			.limit(1);

		if (!connection || connection.disconnectedAt) {
			return { disconnected: true };
		}
		// A non-expiring token (App has token expiry off) has nothing to refresh.
		if (!connection.tokenExpiresAt && !options.force) {
			return { disconnected: false, accessToken: connection.accessToken };
		}
		if (
			!options.force &&
			connection.tokenExpiresAt &&
			connection.tokenExpiresAt.getTime() >
				Date.now() + GITHUB_USER_TOKEN_REFRESH_BUFFER_MS
		) {
			return { disconnected: false, accessToken: connection.accessToken };
		}
		if (
			!connection.refreshToken ||
			!env.GH_APP_CLIENT_ID ||
			!env.GH_APP_CLIENT_SECRET
		) {
			await tx
				.update(integrationConnections)
				.set({
					disconnectedAt: new Date(),
					disconnectReason: "no_refresh_token",
				})
				.where(eq(integrationConnections.id, connectionId));
			return { disconnected: true };
		}

		const response = await fetch(
			"https://github.com/login/oauth/access_token",
			{
				method: "POST",
				headers: {
					Accept: "application/json",
					"Content-Type": "application/x-www-form-urlencoded",
				},
				signal: AbortSignal.timeout(GITHUB_OAUTH_TIMEOUT_MS),
				body: new URLSearchParams({
					grant_type: "refresh_token",
					refresh_token: connection.refreshToken,
					client_id: env.GH_APP_CLIENT_ID,
					client_secret: env.GH_APP_CLIENT_SECRET,
				}),
			},
		);
		const parsed = githubUserTokenResponseSchema.safeParse(
			await response.json().catch(() => null),
		);
		if (!response.ok || !parsed.success) {
			throw new Error(
				`GitHub token refresh failed: ${response.status} ${response.statusText}`,
			);
		}
		if ("error" in parsed.data) {
			// bad_refresh_token: revoked, expired (6 months idle), or already
			// spent by a caller outside this lock. Nothing here recovers it.
			await tx
				.update(integrationConnections)
				.set({
					disconnectedAt: new Date(),
					disconnectReason: parsed.data.error,
				})
				.where(eq(integrationConnections.id, connectionId));
			return { disconnected: true };
		}

		const data = parsed.data;
		await tx
			.update(integrationConnections)
			.set({
				accessToken: data.access_token,
				refreshToken: data.refresh_token ?? connection.refreshToken,
				tokenExpiresAt: data.expires_in
					? new Date(Date.now() + data.expires_in * 1000)
					: null,
				disconnectedAt: null,
				disconnectReason: null,
			})
			.where(eq(integrationConnections.id, connectionId));

		return { disconnected: false, accessToken: data.access_token };
	});
}

/** A token good for at least the refresh buffer, or null if disconnected. */
export async function getGithubUserAccessToken(
	connectionId: string,
): Promise<string | null> {
	const connection = await db.query.integrationConnections.findFirst({
		where: eq(integrationConnections.id, connectionId),
		columns: {
			accessToken: true,
			tokenExpiresAt: true,
			disconnectedAt: true,
		},
	});
	if (!connection || connection.disconnectedAt) return null;

	const expiresSoon =
		connection.tokenExpiresAt !== null &&
		connection.tokenExpiresAt.getTime() - Date.now() <
			GITHUB_USER_TOKEN_REFRESH_BUFFER_MS;
	if (!expiresSoon) return connection.accessToken;

	const result = await refreshGithubUserToken(connectionId);
	return result.disconnected ? null : result.accessToken;
}

/**
 * Revokes the grant on GitHub's side. Without this the App would keep a live
 * user token after the row is gone, which is the opposite of what a person
 * pressing "Disconnect" means. Best effort: a network failure here must not
 * keep the row around.
 */
export async function revokeGithubUserGrant(
	accessToken: string,
): Promise<void> {
	if (!env.GH_APP_CLIENT_ID || !env.GH_APP_CLIENT_SECRET) return;
	const basic = Buffer.from(
		`${env.GH_APP_CLIENT_ID}:${env.GH_APP_CLIENT_SECRET}`,
	).toString("base64");
	await fetch(
		`https://api.github.com/applications/${env.GH_APP_CLIENT_ID}/grant`,
		{
			method: "DELETE",
			headers: {
				Accept: "application/vnd.github+json",
				Authorization: `Basic ${basic}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify({ access_token: accessToken }),
			signal: AbortSignal.timeout(GITHUB_OAUTH_TIMEOUT_MS),
		},
	);
}
