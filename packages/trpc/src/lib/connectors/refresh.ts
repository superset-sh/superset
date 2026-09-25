import { db } from "@superset/db/client";
import { connections, type SelectConnection } from "@superset/db/schema";
import { and, eq, isNull } from "drizzle-orm";
import {
	decryptOptional,
	decryptSecret,
	encryptOptional,
	encryptSecret,
} from "../../router/plugins/crypto";
import { credentialFetch } from "../../router/plugins/manifest";
import { forgetClient, redirectUriFor } from "./client-identity";
import { connectorMethod, requireConnector, resolveEndpoints } from "./index";

const DEFAULT_EXPIRY_BUFFER_SECONDS = 60;
export const NEEDS_REAUTH = "needs_reauth";

export class UnrefreshableConnectionError extends Error {
	constructor(connector: string) {
		super(
			`The ${connector} connection expired and carries no refresh token; reconnect it.`,
		);
		this.name = "UnrefreshableConnectionError";
	}
}

/**
 * The token endpoint was unreachable or answered 5xx. The connection is not
 * known to be bad, so it must not be disconnected or reported as needing
 * reauthorization — the caller is expected to surface this as a bad gateway.
 */
export class ConnectorUnavailableError extends Error {
	constructor(
		readonly connector: string,
		detail: string,
	) {
		super(`The ${connector} token endpoint is unavailable: ${detail}`);
		this.name = "ConnectorUnavailableError";
	}
}

function expiringSoon(expiresAt: Date | null, bufferSeconds: number): boolean {
	if (!expiresAt) return false;
	return expiresAt.getTime() - Date.now() <= bufferSeconds * 1000;
}

function live(id: string) {
	return and(eq(connections.id, id), isNull(connections.disconnectedAt));
}

async function readConnection(id: string): Promise<SelectConnection | null> {
	const [row] = await db.select().from(connections).where(live(id)).limit(1);
	return row ?? null;
}

/**
 * A connection that cannot be refreshed stays a row: marking it here is what
 * lets `connectors.status` say "Reconnect" rather than "Connect", instead of
 * every caller rediscovering the failure. `upsertConnection` clears both
 * fields when the user reconnects.
 */
async function markNeedsReauth(id: string): Promise<void> {
	await db
		.update(connections)
		.set({ disconnectedAt: new Date(), disconnectReason: NEEDS_REAUTH })
		.where(live(id));
}

const inFlight = new Map<string, Promise<SelectConnection>>();

export async function ensureFreshConnection(
	row: SelectConnection,
): Promise<SelectConnection> {
	const connector = requireConnector(row.connector);
	const method = connectorMethod(
		connector,
		row.authMethod as never as undefined,
	);
	if (method.type !== "oauth2") return row;

	const buffer =
		method.token_expiration_buffer ?? DEFAULT_EXPIRY_BUFFER_SECONDS;
	if (!expiringSoon(row.tokenExpiresAt, buffer)) return row;

	// Concurrent requests for one connection nearly always land in the same
	// process, so collapsing them here is what keeps the token endpoint from
	// being asked the same question N times.
	const pending = inFlight.get(row.id);
	if (pending) return await pending;

	const load = refresh(row, buffer).finally(() => {
		inFlight.delete(row.id);
	});
	inFlight.set(row.id, load);
	return await load;
}

/**
 * Deliberately not wrapped in a transaction. The token endpoint is a third
 * party on the other side of the internet, and holding a pooled connection
 * across that call means one slow identity provider drains the pool for every
 * unrelated query in the process. Mutual exclusion comes from the in-flight map
 * above within a process, and from the compare-and-swap below across them: a
 * refresh that loses the race writes nothing and adopts the winner's row.
 */
async function refresh(
	row: SelectConnection,
	buffer: number,
): Promise<SelectConnection> {
	const current = await readConnection(row.id);
	if (!current) return row;
	if (!expiringSoon(current.tokenExpiresAt, buffer)) return current;

	const refreshToken = await decryptOptional(current.refreshToken);
	if (!refreshToken) {
		await markNeedsReauth(current.id);
		throw new UnrefreshableConnectionError(current.connector);
	}

	const connector = requireConnector(current.connector);
	const method = connectorMethod(
		connector,
		current.authMethod as never as undefined,
	);
	const endpoints = await resolveEndpoints(
		current.connector,
		method,
		redirectUriFor(current.connector),
	);
	const { clientId, clientSecret } = endpoints;

	const body = new URLSearchParams({
		grant_type: "refresh_token",
		refresh_token: refreshToken,
	});
	const headers: Record<string, string> = {
		"Content-Type": "application/x-www-form-urlencoded",
		Accept: "application/json",
	};
	if (endpoints.authentication === "basic")
		headers.Authorization = `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`;
	else {
		body.set("client_id", clientId);
		if (clientSecret) body.set("client_secret", clientSecret);
	}

	let response: Response;
	try {
		response = await credentialFetch(
			endpoints.tokenEndpoint,
			{ method: "POST", headers, body },
			`Connector "${current.connector}" refresh`,
		);
	} catch (error) {
		throw new ConnectorUnavailableError(
			current.connector,
			error instanceof Error ? error.message : String(error),
		);
	}
	// A server that is failing tells us nothing about the token; treating it as
	// expired would disconnect a good connection over someone else's outage.
	if (response.status >= 500) {
		throw new ConnectorUnavailableError(
			current.connector,
			`${response.status} ${response.statusText}`,
		);
	}
	const payload = (await response.json()) as Record<string, unknown>;
	if (!response.ok || typeof payload.access_token !== "string") {
		if (endpoints.issuer && payload.error === "invalid_client")
			await forgetClient(
				endpoints.issuer,
				redirectUriFor(current.connector),
				clientId,
			);
		await markNeedsReauth(current.id);
		throw new UnrefreshableConnectionError(current.connector);
	}

	const expiresIn = payload.expires_in;
	const [updated] = await db
		.update(connections)
		.set({
			accessToken: await encryptSecret(payload.access_token),
			refreshToken:
				typeof payload.refresh_token === "string"
					? await encryptSecret(payload.refresh_token)
					: await encryptOptional(refreshToken),
			tokenExpiresAt:
				typeof expiresIn === "number"
					? new Date(Date.now() + expiresIn * 1000)
					: null,
		})
		.where(
			and(
				live(current.id),
				current.tokenExpiresAt
					? eq(connections.tokenExpiresAt, current.tokenExpiresAt)
					: isNull(connections.tokenExpiresAt),
			),
		)
		.returning();
	if (updated) return updated;

	// Zero rows means another process refreshed between our read and our write.
	// Its tokens are the live ones; ours are already superseded.
	return (await readConnection(current.id)) ?? current;
}

export async function connectionAccessToken(
	row: SelectConnection,
): Promise<string> {
	const fresh = await ensureFreshConnection(row);
	return await decryptSecret(fresh.accessToken);
}
