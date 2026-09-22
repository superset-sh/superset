import { db } from "@superset/db/client";
import { connections, type SelectConnection } from "@superset/db/schema";
import { and, asc, desc, eq, isNull, type SQL } from "drizzle-orm";
import { decryptSecret } from "../../router/plugins/crypto";
import { ensureFreshConnection } from "./refresh";

export type ConnectionLookupOptions = { includeDisconnected?: boolean };

const NEWEST_FIRST = [desc(connections.updatedAt), desc(connections.id)];

/**
 * Two live connections match one lookup, so there is no single account to run
 * under. Picking the newest would silently bind tool calls to whichever was
 * touched last — behaviour people would come to rely on before anyone noticed
 * it was arbitrary. Callers surface this as a conflict the user resolves by
 * disconnecting one.
 */
export class AmbiguousConnectionError extends Error {
	constructor(
		readonly connector: string,
		readonly connectionIds: string[],
	) {
		super(
			`More than one ${connector} connection matches; disconnect the one you do not want.`,
		);
		this.name = "AmbiguousConnectionError";
	}
}

/** Two rows are read so a second one can be detected, never to choose between them. */
function single(
	rows: SelectConnection[],
	connector: string,
): SelectConnection | null {
	if (rows.length > 1)
		throw new AmbiguousConnectionError(
			connector,
			rows.map((row) => row.id),
		);
	return rows[0] ?? null;
}

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
	const rows = await db
		.select()
		.from(connections)
		.where(
			live(options, [
				eq(connections.organizationId, organizationId),
				eq(connections.connector, connector),
			]),
		)
		.orderBy(...NEWEST_FIRST)
		.limit(2);
	return single(rows, connector);
}

export async function userConnection(
	organizationId: string,
	connector: string,
	userId: string,
	options: ConnectionLookupOptions = {},
): Promise<SelectConnection | null> {
	const rows = await db
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
		.limit(2);
	return single(rows, connector);
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
