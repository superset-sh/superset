import { db } from "@superset/db/client";
import { connections, type SelectConnection } from "@superset/db/schema";
import { and, asc, desc, eq, isNull, type SQL } from "drizzle-orm";
import { decryptSecret } from "../../router/plugins/crypto";
import { ensureFreshConnection } from "./refresh";

export type ConnectionLookupOptions = { includeDisconnected?: boolean };

const NEWEST_FIRST = [desc(connections.updatedAt), desc(connections.id)];

function live(
	options: ConnectionLookupOptions,
	clauses: (SQL | undefined)[],
): SQL | undefined {
	return and(
		...clauses,
		...(options.includeDisconnected
			? []
			: [isNull(connections.disconnectedAt)]),
	);
}

export async function orgConnection(
	organizationId: string,
	connector: string,
	options: ConnectionLookupOptions = {},
): Promise<SelectConnection | null> {
	const [row] = await db
		.select()
		.from(connections)
		.where(
			live(options, [
				eq(connections.organizationId, organizationId),
				eq(connections.connector, connector),
			]),
		)
		.orderBy(...NEWEST_FIRST)
		.limit(1);
	return row ?? null;
}

export async function userConnection(
	organizationId: string,
	connector: string,
	userId: string,
	options: ConnectionLookupOptions = {},
): Promise<SelectConnection | null> {
	const [row] = await db
		.select()
		.from(connections)
		.where(
			live(options, [
				eq(connections.organizationId, organizationId),
				eq(connections.connector, connector),
				eq(connections.connectedByUserId, userId),
			]),
		)
		.orderBy(...NEWEST_FIRST)
		.limit(1);
	return row ?? null;
}

export async function accountConnection(
	connector: string,
	externalAccountId: string,
	options: ConnectionLookupOptions = {},
): Promise<SelectConnection | null> {
	const [row] = await db
		.select()
		.from(connections)
		.where(
			live(options, [
				eq(connections.connector, connector),
				eq(connections.externalAccountId, externalAccountId),
			]),
		)
		.orderBy(...NEWEST_FIRST)
		.limit(1);
	return row ?? null;
}

export async function accountConnections(
	connector: string,
	externalAccountId: string,
	options: ConnectionLookupOptions = {},
): Promise<SelectConnection[]> {
	return db
		.select()
		.from(connections)
		.where(
			live(options, [
				eq(connections.connector, connector),
				eq(connections.externalAccountId, externalAccountId),
			]),
		)
		.orderBy(asc(connections.id));
}

export async function connectorConnections(
	connector: string,
	options: ConnectionLookupOptions = {},
): Promise<SelectConnection[]> {
	return db
		.select()
		.from(connections)
		.where(live(options, [eq(connections.connector, connector)]))
		.orderBy(asc(connections.id));
}

export async function connectionById(
	connectionId: string,
	options: ConnectionLookupOptions & { connector?: string } = {},
): Promise<SelectConnection | null> {
	const [row] = await db
		.select()
		.from(connections)
		.where(
			live(options, [
				eq(connections.id, connectionId),
				...(options.connector
					? [eq(connections.connector, options.connector)]
					: []),
			]),
		)
		.limit(1);
	return row ?? null;
}

export async function connectionBotToken(
	row: SelectConnection,
): Promise<string> {
	const fresh = await ensureFreshConnection(row);
	return decryptSecret(fresh.config?.bot_token ?? fresh.accessToken);
}
