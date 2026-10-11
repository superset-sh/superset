import type { V1MigrationIpc } from "./ipc";
import { ledgerKey, type V1LedgerOutcome } from "./ledger";

export const OWNED_BY_OTHER_ORGANIZATION = "owned-by-other-organization";

export interface V1LedgerOwner {
	organizationId: string;
	v1Id: string;
	kind: string;
}

export interface V1ForeignClaims {
	projectIds: Set<string>;
	workspaceIds: Set<string>;
	workspaceIdsOwnedHere: Set<string>;
}

// Two orgs must never adopt one folder: v1 data stays with the first org.
export function foreignV1Claims(
	owners: V1LedgerOwner[],
	organizationId: string,
): V1ForeignClaims {
	const ownedHere = new Set(
		owners
			.filter((o) => o.organizationId === organizationId)
			.map((o) => `${o.kind}\0${o.v1Id}`),
	);
	const claims: V1ForeignClaims = {
		projectIds: new Set(),
		workspaceIds: new Set(),
		workspaceIdsOwnedHere: new Set(
			owners
				.filter(
					(o) => o.organizationId === organizationId && o.kind === "workspace",
				)
				.map((o) => o.v1Id),
		),
	};
	for (const owner of owners) {
		if (owner.organizationId === organizationId) continue;
		if (ownedHere.has(`${owner.kind}\0${owner.v1Id}`)) continue;
		if (owner.kind === "project") claims.projectIds.add(owner.v1Id);
		if (owner.kind === "workspace") claims.workspaceIds.add(owner.v1Id);
	}
	return claims;
}

export function isForeignV1Workspace(
	workspace: { id: string; projectId: string },
	claims: V1ForeignClaims,
): boolean {
	if (claims.workspaceIdsOwnedHere.has(workspace.id)) return false;
	return (
		claims.workspaceIds.has(workspace.id) ||
		claims.projectIds.has(workspace.projectId)
	);
}

export interface ScopedV1MigrationIpc {
	ipc: V1MigrationIpc;
	leftOut: number;
}

export async function scopeV1MigrationIpc(
	ipc: V1MigrationIpc,
	organizationId: string,
): Promise<ScopedV1MigrationIpc> {
	if (!ipc.ledgerOwners) return { ipc, leftOut: 0 };
	const claims = foreignV1Claims(await ipc.ledgerOwners(), organizationId);
	if (claims.projectIds.size === 0 && claims.workspaceIds.size === 0) {
		return { ipc, leftOut: 0 };
	}

	const readV1Workspaces = async () =>
		(await ipc.readV1Workspaces()).filter(
			(w) => !isForeignV1Workspace(w, claims),
		);
	const foreignWorkspaceIds = async () =>
		new Set(
			(await ipc.readV1Workspaces())
				.filter((w) => isForeignV1Workspace(w, claims))
				.map((w) => w.id),
		);

	const [projects, foreignWorkspaces, ledgerRows] = await Promise.all([
		ipc.readV1Projects(),
		foreignWorkspaceIds(),
		ipc.ledgerList(organizationId),
	]);
	const recorded = new Set(
		ledgerRows
			.filter((r) => r.reason === OWNED_BY_OTHER_ORGANIZATION)
			.map((r) => ledgerKey(r.kind, r.v1Id)),
	);
	const leftOut = [
		...projects
			.filter((p) => claims.projectIds.has(p.id))
			.map((p) => ({ v1Id: p.id, kind: "project" as const })),
		...Array.from(foreignWorkspaces, (id) => ({
			v1Id: id,
			kind: "workspace" as const,
		})),
	];
	const skips: V1LedgerOutcome[] = leftOut
		.filter((entry) => !recorded.has(ledgerKey(entry.kind, entry.v1Id)))
		.map((entry) => ({
			...entry,
			status: "skipped" as const,
			reason: OWNED_BY_OTHER_ORGANIZATION,
		}));
	if (skips.length > 0) await ipc.ledgerRecord(organizationId, skips);

	const scoped: V1MigrationIpc = {
		...ipc,
		readV1Projects: async () =>
			(await ipc.readV1Projects()).filter((p) => !claims.projectIds.has(p.id)),
		readV1Workspaces,
		readV1Groups: async () =>
			(await ipc.readV1Groups()).filter(
				(g) => !claims.projectIds.has(g.projectId),
			),
		readV1TerminalPanes: async () => {
			const [panes, foreign] = await Promise.all([
				ipc.readV1TerminalPanes(),
				foreignWorkspaceIds(),
			]);
			return panes.filter((p) => !foreign.has(p.v1WorkspaceId));
		},
	};
	return { ipc: scoped, leftOut: leftOut.length };
}
