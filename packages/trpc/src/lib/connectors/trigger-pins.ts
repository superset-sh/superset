import { db, type dbWs } from "@superset/db/client";
import {
	type AutomationTriggerKind,
	automations,
	automationTriggers,
	connections,
} from "@superset/db/schema";
import {
	accountToPinTo,
	triggerKindsForConnector,
} from "@superset/shared/automation-triggers";
import { and, eq, inArray, isNull } from "drizzle-orm";

/**
 * The connection write and the pin that follows it have to commit together, so
 * both steps take the caller's transaction rather than the ambient client.
 */
export type ConnectorTx =
	| typeof db
	| Parameters<Parameters<typeof dbWs.transaction>[0]>[0];

export async function liveConnectionIds(
	organizationId: string,
	connector: string,
	userId: string,
	tx: ConnectorTx = db,
): Promise<string[]> {
	const rows = await tx
		.select({ id: connections.id })
		.from(connections)
		.where(
			and(
				eq(connections.organizationId, organizationId),
				eq(connections.connector, connector),
				eq(connections.connectedByUserId, userId),
				isNull(connections.disconnectedAt),
			),
		);
	return rows.map((row) => row.id);
}

export async function pinTriggersToExistingAccount(params: {
	organizationId: string;
	connector: string;
	userId: string;
	previousConnectionIds: string[];
	connectionId: string;
	tx?: ConnectorTx;
}): Promise<void> {
	const existing = accountToPinTo(
		params.previousConnectionIds,
		params.connectionId,
	);
	if (!existing) return;

	const kinds = triggerKindsForConnector(params.connector);
	if (kinds.length === 0) return;

	const exec = params.tx ?? db;
	const owned = exec
		.select({ id: automations.id })
		.from(automations)
		.where(
			and(
				eq(automations.organizationId, params.organizationId),
				eq(automations.ownerUserId, params.userId),
			),
		);

	await exec
		.update(automationTriggers)
		.set({ connectionId: existing })
		.where(
			and(
				eq(automationTriggers.organizationId, params.organizationId),
				inArray(automationTriggers.kind, kinds as AutomationTriggerKind[]),
				isNull(automationTriggers.connectionId),
				inArray(automationTriggers.automationId, owned),
			),
		);
}
