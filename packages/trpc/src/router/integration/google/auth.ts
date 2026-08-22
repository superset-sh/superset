import { db } from "@superset/db/client";
import { integrationConnections } from "@superset/db/schema";
import { withConnectionLock } from "@superset/db/utils";
import { eq } from "drizzle-orm";
import { GaxiosError, type GaxiosResponse } from "gaxios";
import { type Credentials, OAuth2Client } from "google-auth-library";
import { z } from "zod";
import { env } from "../../../env";
import { REFRESH_BUFFER_MS, REFRESH_TOKEN_TIMEOUT_MS } from "./constants";

export const googleTokenResponseSchema = z.object({
	access_token: z.string(),
	expires_in: z.number(),
	// Only on the initial exchange, and on a refresh when Google chooses to
	// rotate. Absent means keep the one already stored.
	refresh_token: z.string().optional(),
	scope: z.string().optional(),
	token_type: z.string().optional(),
	id_token: z.string().optional(),
});
export type GoogleTokenResponse = z.infer<typeof googleTokenResponseSchema>;

/** The HTTP status of a failed Google API call, for 404/410 protocol signals. */
export function googleErrorStatus(error: unknown): number | undefined {
	return error instanceof GaxiosError ? error.status : undefined;
}

type GetTokenResponse = { tokens: Credentials; res: GaxiosResponse | null };

/**
 * One connection's OAuth2 client. The SDK refreshes the access token when it
 * is within the buffer of expiring (and once more after a 401); the refresh
 * itself runs under the connection's advisory lock so two concurrent callers
 * do not both spend the refresh token, and every refreshed token is persisted
 * inside that lock.
 */
class ConnectionOAuth2Client extends OAuth2Client {
	constructor(private readonly connectionId: string) {
		super({
			clientId: env.GOOGLE_CLIENT_ID,
			clientSecret: env.GOOGLE_CLIENT_SECRET,
			eagerRefreshThresholdMillis: REFRESH_BUFFER_MS,
			forceRefreshOnFailure: true,
			// Applies to the token endpoint; API calls carry their own timeout.
			transporterOptions: { timeout: REFRESH_TOKEN_TIMEOUT_MS },
		});
	}

	protected override async refreshTokenNoCache(): Promise<GetTokenResponse> {
		return withConnectionLock(this.connectionId, async (tx) => {
			const [connection] = await tx
				.select({
					accessToken: integrationConnections.accessToken,
					refreshToken: integrationConnections.refreshToken,
					tokenExpiresAt: integrationConnections.tokenExpiresAt,
					disconnectedAt: integrationConnections.disconnectedAt,
				})
				.from(integrationConnections)
				.where(eq(integrationConnections.id, this.connectionId))
				.limit(1);
			if (!connection?.refreshToken || connection.disconnectedAt) {
				throw new Error(`Google connection ${this.connectionId} disconnected`);
			}

			// Another caller refreshed while this one waited on the lock: its
			// token is stored and fresh, so use it instead of refreshing again.
			if (
				connection.accessToken !== this.credentials.access_token &&
				connection.tokenExpiresAt &&
				connection.tokenExpiresAt.getTime() > Date.now() + REFRESH_BUFFER_MS
			) {
				return {
					tokens: {
						access_token: connection.accessToken,
						refresh_token: connection.refreshToken,
						expiry_date: connection.tokenExpiresAt.getTime(),
					},
					res: null,
				};
			}

			let response: GetTokenResponse;
			try {
				response = await super.refreshTokenNoCache(connection.refreshToken);
			} catch (error) {
				// The grant was revoked (or the app's access removed in the account
				// settings). Nothing here can recover it; the person has to reconnect.
				if (isInvalidGrant(error)) {
					await tx
						.update(integrationConnections)
						.set({
							disconnectedAt: new Date(),
							disconnectReason: "invalid_grant",
						})
						.where(eq(integrationConnections.id, this.connectionId));
				}
				throw error;
			}

			const { tokens } = response;
			if (tokens.access_token) {
				await tx
					.update(integrationConnections)
					.set({
						accessToken: tokens.access_token,
						refreshToken: tokens.refresh_token ?? connection.refreshToken,
						tokenExpiresAt: tokens.expiry_date
							? new Date(tokens.expiry_date)
							: null,
						disconnectedAt: null,
						disconnectReason: null,
					})
					.where(eq(integrationConnections.id, this.connectionId));
			}
			return response;
		});
	}
}

function isInvalidGrant(error: unknown): boolean {
	if (!(error instanceof GaxiosError)) return false;
	const data = error.response?.data as { error?: string } | undefined;
	return data?.error === "invalid_grant" || error.message === "invalid_grant";
}

/**
 * An authenticated client for one connection, its tokens loaded from
 * `integration_connections`. Throws when the connection is disconnected or,
 * with no refresh token, its access token is about to expire.
 */
export async function googleAuthFor(
	connectionId: string,
): Promise<OAuth2Client> {
	const connection = await db.query.integrationConnections.findFirst({
		where: eq(integrationConnections.id, connectionId),
		columns: {
			accessToken: true,
			refreshToken: true,
			tokenExpiresAt: true,
			disconnectedAt: true,
		},
	});
	if (!connection || connection.disconnectedAt) {
		throw new Error(`Google connection ${connectionId} disconnected`);
	}

	const expiresSoon =
		!connection.tokenExpiresAt ||
		connection.tokenExpiresAt.getTime() - Date.now() < REFRESH_BUFFER_MS;
	if (!connection.refreshToken && expiresSoon) {
		await db
			.update(integrationConnections)
			.set({ disconnectedAt: new Date(), disconnectReason: "no_refresh_token" })
			.where(eq(integrationConnections.id, connectionId));
		throw new Error(`Google connection ${connectionId} disconnected`);
	}

	const client = new ConnectionOAuth2Client(connectionId);
	client.setCredentials({
		access_token: connection.accessToken,
		refresh_token: connection.refreshToken,
		// A row without an expiry cannot be trusted; 1 rather than 0, which the
		// SDK reads as "never expires", forces a refresh before first use.
		expiry_date: connection.tokenExpiresAt?.getTime() ?? 1,
	});
	return client;
}
