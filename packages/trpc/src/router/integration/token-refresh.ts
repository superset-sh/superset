import { db } from "@superset/db/client";
import { integrationConnections } from "@superset/db/schema";
import { withConnectionLock } from "@superset/db/utils";
import { eq } from "drizzle-orm";

/** Refresh a token this many ms before it actually expires. */
export const REFRESH_BUFFER_MS = 5 * 60 * 1000;

export type RefreshedToken =
	| { disconnected: true }
	| { disconnected: false; accessToken: string };

export type RefreshableConnection = {
	accessToken: string;
	refreshToken: string | null;
	tokenExpiresAt: Date | null;
	config: unknown;
};

/** A token endpoint's non-ok answer, kept for `revokedWhen` to classify. */
export class TokenRefreshError extends Error {
	constructor(
		public readonly status: number,
		public readonly body: unknown,
		message: string,
	) {
		super(message);
		this.name = "TokenRefreshError";
	}
}

type TokenExchange = (
	connection: RefreshableConnection,
) => Promise<
	| { accessToken: string; refreshToken: string; tokenExpiresAt: Date }
	| { keep: true }
	| { revoked: string }
>;

/**
 * A usable access token for a connection, refreshed under the connection's
 * advisory lock when it is within `REFRESH_BUFFER_MS` of expiry — serialized
 * so two callers do not both burn a one-time refresh token.
 *
 * `exchange` performs the provider's refresh call: new tokens, `{keep: true}`
 * when refresh is impossible and the current token is all there is, or
 * `{revoked: reason}` when the grant is known gone. A thrown error goes
 * through `revokedWhen`: a reason marks the connection disconnected, null
 * rethrows (transient). Success clears any disconnected marker.
 */
export async function withRefreshedToken(
	connectionId: string,
	opts: {
		exchange: TokenExchange;
		revokedWhen?: (error: unknown) => string | null;
	},
): Promise<RefreshedToken> {
	return withConnectionLock(connectionId, async (tx) => {
		const [connection] = await tx
			.select({
				accessToken: integrationConnections.accessToken,
				refreshToken: integrationConnections.refreshToken,
				tokenExpiresAt: integrationConnections.tokenExpiresAt,
				disconnectedAt: integrationConnections.disconnectedAt,
				config: integrationConnections.config,
			})
			.from(integrationConnections)
			.where(eq(integrationConnections.id, connectionId))
			.limit(1);

		if (!connection || connection.disconnectedAt) return { disconnected: true };
		if (
			connection.tokenExpiresAt &&
			connection.tokenExpiresAt.getTime() > Date.now() + REFRESH_BUFFER_MS
		) {
			return { disconnected: false, accessToken: connection.accessToken };
		}

		const disconnect = async (reason: string): Promise<RefreshedToken> => {
			await tx
				.update(integrationConnections)
				.set({ disconnectedAt: new Date(), disconnectReason: reason })
				.where(eq(integrationConnections.id, connectionId));
			return { disconnected: true };
		};

		let result: Awaited<ReturnType<TokenExchange>>;
		try {
			result = await opts.exchange(connection);
		} catch (error) {
			const reason = opts.revokedWhen?.(error);
			if (reason) return disconnect(reason);
			throw error;
		}
		if ("keep" in result) {
			return { disconnected: false, accessToken: connection.accessToken };
		}
		if ("revoked" in result) return disconnect(result.revoked);

		await tx
			.update(integrationConnections)
			.set({
				accessToken: result.accessToken,
				refreshToken: result.refreshToken,
				tokenExpiresAt: result.tokenExpiresAt,
				disconnectedAt: null,
				disconnectReason: null,
			})
			.where(eq(integrationConnections.id, connectionId));
		return { disconnected: false, accessToken: result.accessToken };
	});
}

/** Mark a connection disconnected; `clearTokens` also drops its token pair. */
export async function markDisconnected(
	connectionId: string,
	reason: string,
	opts: { clearTokens?: boolean } = {},
): Promise<void> {
	await db
		.update(integrationConnections)
		.set({
			disconnectedAt: new Date(),
			disconnectReason: reason,
			...(opts.clearTokens ? { accessToken: "", refreshToken: null } : {}),
		})
		.where(eq(integrationConnections.id, connectionId));
}
