import type { V1MigrationKind, V1MigrationStatus } from "@superset/local-db";
import { electronTrpcClient } from "renderer/lib/trpc-client";

export interface V1LedgerOutcome {
	v1Id: string;
	kind: V1MigrationKind;
	status: V1MigrationStatus;
	v2Id?: string | null;
	reason?: string | null;
}

export type V1LedgerMap = Map<
	string,
	{ status: V1MigrationStatus; v2Id: string | null }
>;

export function ledgerKey(kind: V1MigrationKind, v1Id: string): string {
	return `${kind}\0${v1Id}`;
}

/** An entity is done when it migrated or linked; error/skipped retry next run. */
export function isTerminalStatus(status: V1MigrationStatus): boolean {
	return status === "success" || status === "linked";
}

export async function loadV1MigrationLedger(
	organizationId: string,
): Promise<V1LedgerMap> {
	const rows = await electronTrpcClient.migration.ledgerList.query({
		organizationId,
	});
	const map: V1LedgerMap = new Map();
	for (const row of rows) {
		map.set(ledgerKey(row.kind, row.v1Id), {
			status: row.status,
			v2Id: row.v2Id,
		});
	}
	return map;
}

export async function recordV1MigrationOutcomes(
	organizationId: string,
	entries: V1LedgerOutcome[],
): Promise<void> {
	if (entries.length === 0) return;
	await electronTrpcClient.migration.ledgerRecord.mutate({
		organizationId,
		entries,
	});
}

/** Fire-and-forget variant for UI call sites — the ledger is advisory there. */
export function recordV1MigrationOutcome(
	organizationId: string,
	entry: V1LedgerOutcome,
): void {
	void recordV1MigrationOutcomes(organizationId, [entry]).catch((err) => {
		console.error("[v1-migration] ledger record failed", { entry, err });
	});
}
