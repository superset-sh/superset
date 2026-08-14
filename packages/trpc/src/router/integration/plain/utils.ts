import { db } from "@superset/db/client";
import { integrationConnections } from "@superset/db/schema";
import { and, eq } from "drizzle-orm";
import { isPlainAuthError, PlainClient } from "./client";

export async function getPlainConnection(organizationId: string) {
	const connection = await db.query.integrationConnections.findFirst({
		where: and(
			eq(integrationConnections.organizationId, organizationId),
			eq(integrationConnections.provider, "plain"),
		),
	});

	if (!connection || connection.disconnectedAt) {
		return null;
	}

	return connection;
}

export async function getPlainClient(
	organizationId: string,
): Promise<PlainClient | null> {
	const connection = await getPlainConnection(organizationId);
	if (!connection) return null;
	return new PlainClient(connection.accessToken);
}

export async function markConnectionDisconnected(
	connectionId: string,
	reason: string,
): Promise<void> {
	await db
		.update(integrationConnections)
		.set({ disconnectedAt: new Date(), disconnectReason: reason })
		.where(eq(integrationConnections.id, connectionId));
}

/**
 * Runs `fn` against the org's Plain connection. API keys don't refresh, so an
 * auth failure means the key was revoked: the connection is marked
 * disconnected and `null` is returned, mirroring `callLinear`'s contract.
 */
export async function callPlain<T>(
	organizationId: string,
	fn: (client: PlainClient) => Promise<T>,
): Promise<T | null> {
	const connection = await getPlainConnection(organizationId);
	if (!connection) return null;

	try {
		return await fn(new PlainClient(connection.accessToken));
	} catch (error) {
		if (isPlainAuthError(error)) {
			await markConnectionDisconnected(connection.id, "invalid_api_key");
			return null;
		}
		throw error;
	}
}
