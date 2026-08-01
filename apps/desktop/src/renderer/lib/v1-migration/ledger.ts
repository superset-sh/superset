import type { V1MigrationKind, V1MigrationStatus } from "@superset/local-db";

export interface V1LedgerOutcome {
	v1Id: string;
	kind: V1MigrationKind;
	status: V1MigrationStatus;
	v2Id?: string | null;
	reason?: string | null;
}

export interface V1LedgerRow {
	v1Id: string;
	kind: V1MigrationKind;
	status: V1MigrationStatus;
	v2Id: string | null;
	reason: string | null;
}

export type V1LedgerMap = Map<
	string,
	{ status: V1MigrationStatus; v2Id: string | null }
>;

/** The slice of V1MigrationIpc the ledger helpers need. */
export interface V1LedgerSource {
	ledgerList(organizationId: string): Promise<V1LedgerRow[]>;
	ledgerRecord(
		organizationId: string,
		entries: V1LedgerOutcome[],
	): Promise<void>;
}

export function ledgerKey(kind: V1MigrationKind, v1Id: string): string {
	return `${kind}\0${v1Id}`;
}

/** An entity is done when it migrated or linked; error/skipped retry next run. */
export function isTerminalStatus(status: V1MigrationStatus): boolean {
	return status === "success" || status === "linked";
}

export async function loadV1MigrationLedger(
	source: Pick<V1LedgerSource, "ledgerList">,
	organizationId: string,
): Promise<V1LedgerMap> {
	const rows = await source.ledgerList(organizationId);
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
	source: Pick<V1LedgerSource, "ledgerRecord">,
	organizationId: string,
	entries: V1LedgerOutcome[],
): Promise<void> {
	if (entries.length === 0) return;
	await source.ledgerRecord(organizationId, entries);
}
