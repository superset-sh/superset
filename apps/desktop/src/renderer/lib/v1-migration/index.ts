export { recordV1MigrationOutcome } from "./ipc";
export { buildV2TerminalPresetRow, resolvePresetImport } from "./presets";
export {
	decideProjectImport,
	expectedRemoteUrlFor,
	extractExistingPath,
	importV1Project,
	isProjectAlreadyImported,
	type ProjectFindByPathResult,
	type ProjectImportDecision,
	type ProjectImportOutcome,
} from "./projects";
export { runV1Migration } from "./runV1Migration";
export { adoptV1Workspace } from "./workspaces";
