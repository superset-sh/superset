import type { TerminalPreset } from "@superset/local-db";
import type { BranchPrefixMode } from "@superset/shared/workspace-launch";
import { electronTrpcClient } from "renderer/lib/trpc-client";
import type { V1LedgerOutcome, V1LedgerRow } from "./ledger";

// Minimal row shapes the migrator actually reads — the electron queries
// return supersets. Keeping the interface narrow is what lets the whole
// pass run against in-memory fakes in tests.

export interface V1ProjectRow {
	id: string;
	name: string;
	mainRepoPath: string;
	githubOwner: string | null;
	worktreeBaseDir: string | null;
	branchPrefixMode: BranchPrefixMode | null;
	branchPrefixCustom: string | null;
}

export interface V1WorkspaceRow {
	id: string;
	projectId: string;
	worktreeId: string | null;
	name: string;
	branch: string;
}

export interface V1WorktreeRow {
	id: string;
	path: string;
	baseBranch: string | null;
}

export interface V1SettingsRow {
	lastActiveWorkspaceId: string | null;
	branchPrefixMode: BranchPrefixMode | null;
	branchPrefixCustom: string | null;
}

export interface V1TerminalPaneRow {
	paneId: string;
	v1WorkspaceId: string;
	cwd: string | null;
}

/**
 * Everything the migrator needs from the electron main process. Injected so
 * runV1Migration is testable end-to-end with in-memory fakes.
 */
export interface V1MigrationIpc {
	readV1Projects(): Promise<V1ProjectRow[]>;
	readV1Workspaces(): Promise<V1WorkspaceRow[]>;
	readV1Worktrees(): Promise<V1WorktreeRow[]>;
	readV1Settings(): Promise<V1SettingsRow | null>;
	readV1TerminalPanes(): Promise<V1TerminalPaneRow[]>;
	readV1TerminalPresets(): Promise<TerminalPreset[]>;
	ledgerList(organizationId: string): Promise<V1LedgerRow[]>;
	ledgerRecord(
		organizationId: string,
		entries: V1LedgerOutcome[],
	): Promise<void>;
}

export const electronV1MigrationIpc: V1MigrationIpc = {
	readV1Projects: () => electronTrpcClient.migration.readV1Projects.query(),
	readV1Workspaces: () => electronTrpcClient.migration.readV1Workspaces.query(),
	readV1Worktrees: () => electronTrpcClient.migration.readV1Worktrees.query(),
	readV1Settings: () => electronTrpcClient.migration.readV1Settings.query(),
	readV1TerminalPanes: () =>
		electronTrpcClient.migration.readV1TerminalPanes.query(),
	readV1TerminalPresets: () =>
		electronTrpcClient.settings.getTerminalPresets.query(),
	ledgerList: (organizationId) =>
		electronTrpcClient.migration.ledgerList.query({ organizationId }),
	ledgerRecord: async (organizationId, entries) => {
		await electronTrpcClient.migration.ledgerRecord.mutate({
			organizationId,
			entries,
		});
	},
};

/** Fire-and-forget variant for UI call sites — the ledger is advisory there. */
export function recordV1MigrationOutcome(
	organizationId: string,
	entry: V1LedgerOutcome,
): void {
	void electronV1MigrationIpc
		.ledgerRecord(organizationId, [entry])
		.catch((err) => {
			console.error("[v1-migration] ledger record failed", { entry, err });
		});
}
