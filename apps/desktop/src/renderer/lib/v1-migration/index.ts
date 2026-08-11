export {
	consumeV1ContinuityPending,
	isV1MigrationComplete,
	isV1MigrationCompleteAtBoot,
	markV1MigrationComplete,
} from "./completion";
export {
	electronV1MigrationIpc,
	recordV1MigrationOutcome,
	type V1MigrationIpc,
} from "./ipc";
export {
	isTerminalStatus,
	ledgerKey,
	loadV1MigrationLedger,
	recordV1MigrationOutcomes,
	type V1LedgerOutcome,
	type V1LedgerRow,
} from "./ledger";
export {
	type AgentConfigLike,
	buildV2TerminalPresetRow,
	type ResolvedPresetImport,
	resolvePresetImport,
	type V2PresetLike,
} from "./presets";
export {
	decideProjectImport,
	expectedRemoteUrlFor,
	extractExistingPath,
	findProjectByPath,
	importV1Project,
	isAlreadySetUpElsewhereError,
	isProjectAlreadyImported,
	type ProjectFindByPathResult,
	type ProjectImportDecision,
	type ProjectImportOutcome,
	type V1ProjectLike,
} from "./projects";
export {
	type RunV1MigrationDeps,
	runV1Migration,
	type V1MigrationSummary,
} from "./runV1Migration";
export {
	type HostBranchPrefixPlan,
	type ProjectPrefsPlan,
	planHostBranchPrefix,
	planProjectPrefs,
} from "./settings";
export {
	type PendingMigratedTerminal,
	planTerminalMigration,
	type TerminalMigrationPlan,
	type V1TerminalPane,
} from "./terminals";
export {
	type AdoptPlanEntry,
	adoptV1Workspace,
	planWorkspaceAdoptions,
	type WorkspacePlan,
} from "./workspaces";
