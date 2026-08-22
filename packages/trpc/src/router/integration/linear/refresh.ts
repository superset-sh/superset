import { LinearClient } from "@linear/sdk";
import { db } from "@superset/db/client";
import { integrationConnections } from "@superset/db/schema";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { env } from "../../../env";
import {
	markDisconnected,
	type RefreshedToken,
	TokenRefreshError,
	withRefreshedToken,
} from "../token-refresh";
import { REFRESH_TOKEN_TIMEOUT_MS } from "./constants";
import { getLinearClient } from "./utils";

export const linearTokenResponseSchema = z.object({
	access_token: z.string(),
	refresh_token: z.string(),
	expires_in: z.number(),
	token_type: z.string().optional(),
	scope: z.string().optional(),
});

export type LinearTokenResponse = z.infer<typeof linearTokenResponseSchema>;

export async function refreshLinearToken(
	connectionId: string,
): Promise<RefreshedToken> {
	return withRefreshedToken(connectionId, {
		exchange: async (connection) => {
			if (!connection.refreshToken) return { revoked: "no_refresh_token" };

			const controller = new AbortController();
			const timeout = setTimeout(
				() => controller.abort(),
				REFRESH_TOKEN_TIMEOUT_MS,
			);
			let response: Response;
			try {
				response = await fetch("https://api.linear.app/oauth/token", {
					method: "POST",
					headers: { "Content-Type": "application/x-www-form-urlencoded" },
					signal: controller.signal,
					body: new URLSearchParams({
						grant_type: "refresh_token",
						refresh_token: connection.refreshToken,
						client_id: env.LINEAR_CLIENT_ID,
						client_secret: env.LINEAR_CLIENT_SECRET,
					}),
				});
			} finally {
				clearTimeout(timeout);
			}

			if (!response.ok) {
				throw new TokenRefreshError(
					response.status,
					await response.json().catch(() => ({})),
					`Linear token refresh failed: ${response.status} ${response.statusText}`,
				);
			}

			const data = linearTokenResponseSchema.parse(await response.json());
			return {
				accessToken: data.access_token,
				refreshToken: data.refresh_token,
				tokenExpiresAt: new Date(Date.now() + data.expires_in * 1000),
			};
		},
		revokedWhen: (error) =>
			error instanceof TokenRefreshError &&
			(error.body as { error?: string }).error === "invalid_grant"
				? "invalid_grant"
				: null,
	});
}

export async function callLinear<T>(
	organizationId: string,
	fn: (client: LinearClient) => Promise<T>,
): Promise<T | null> {
	const client = await getLinearClient(organizationId);
	if (!client) return null;

	try {
		return await fn(client);
	} catch (error) {
		if (!isLinearAuthError(error)) throw error;

		const connection = await db.query.integrationConnections.findFirst({
			where: and(
				eq(integrationConnections.organizationId, organizationId),
				eq(integrationConnections.provider, "linear"),
			),
		});
		if (!connection) return null;
		if (!connection.refreshToken) {
			await markDisconnected(connection.id, "no_refresh_token");
			return null;
		}

		const result = await refreshLinearToken(connection.id);
		if (result.disconnected) return null;

		try {
			return await fn(new LinearClient({ accessToken: result.accessToken }));
		} catch (retryError) {
			if (isLinearAuthError(retryError)) return null;
			throw retryError;
		}
	}
}

export function isLinearAuthError(error: unknown): boolean {
	if (typeof error !== "object" || error === null) return false;
	const candidate = error as {
		type?: string;
		errors?: Array<{ extensions?: { code?: string } }>;
		status?: number;
	};
	if (candidate.type === "AuthenticationError") return true;
	if (candidate.status === 401) return true;
	if (
		candidate.errors?.some(
			(item) => item.extensions?.code === "AUTHENTICATION_ERROR",
		)
	) {
		return true;
	}
	return false;
}
