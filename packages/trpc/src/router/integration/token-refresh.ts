import { db } from "@superset/db/client";
import { connections, type IntegrationConfig } from "@superset/db/schema";
import { withConnectionLock } from "@superset/db/utils";
import { eq } from "drizzle-orm";
import {
	decryptOptional,
	decryptSecret,
	encryptOptional,
	encryptSecret,
} from "../../lib/connectors";

/** Refresh a token this many ms before it actually expires. */
export const REFRESH_BUFFER_MS = 5 * 60 * 1000;

export type RefreshedToken =
	| { disconnected: true }
	| { disconnected: false; accessToken: string };

export type RefreshableConnection = {
	accessToken: string;
	refreshToken: string | null;
	tokenExpiresAt: Date | null;
	state: IntegrationConfig | null;
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
 *
 * Tokens are stored encrypted; `exchange` is handed and returns plaintext.
 */
export async function withRefreshedToken(
	connectionId: string,
	opts: {
		exchange: TokenExchange;
		revokedWhen?: (error: unknown) => string | null;
	},
): Promise<RefreshedToken> {
	return withConnectionLock(connectionId, async (tx) => {
		const [row] = await tx
			.select({
				accessToken: connections.accessToken,
				refreshToken: connections.refreshToken,
				tokenExpiresAt: connections.tokenExpiresAt,
				disconnectedAt: connections.disconnectedAt,
				state: connections.state,
			})
			.from(connections)
			.where(eq(connections.id, connectionId))
			.limit(1);

		if (!row || row.disconnectedAt) return { disconnected: true };

		const accessToken = await decryptSecret(row.accessToken);
		if (
			row.tokenExpiresAt &&
			row.tokenExpiresAt.getTime() > Date.now() + REFRESH_BUFFER_MS
		) {
			return { disconnected: false, accessToken };
		}

		const connection: RefreshableConnection = {
			accessToken,
			refreshToken: await decryptOptional(row.refreshToken),
			tokenExpiresAt: row.tokenExpiresAt,
			state: row.state ?? null,
		};

		const disconnect = async (reason: string): Promise<RefreshedToken> => {
			await tx
				.update(connections)
				.set({ disconnectedAt: new Date(), disconnectReason: reason })
				.where(eq(connections.id, connectionId));
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
		if ("keep" in result) return { disconnected: false, accessToken };
		if ("revoked" in result) return disconnect(result.revoked);

		await tx
			.update(connections)
			.set({
				accessToken: await encryptSecret(result.accessToken),
				refreshToken: await encryptOptional(result.refreshToken),
				tokenExpiresAt: result.tokenExpiresAt,
				disconnectedAt: null,
				disconnectReason: null,
			})
			.where(eq(connections.id, connectionId));
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
		.update(connections)
		.set({
			disconnectedAt: new Date(),
			disconnectReason: reason,
			...(opts.clearTokens
				? { accessToken: await encryptSecret(""), refreshToken: null }
				: {}),
		})
		.where(eq(connections.id, connectionId));
}
