/**
 * Re-export CLI types for Desktop app
 * Uses workspace import for proper monorepo resolution
 */

export type {
	AgentSummary,
	Change,
	ChangeOrchestrator,
	FileDiff,
} from "@superset/cli/types/change";
export type {
	Environment,
	EnvironmentOrchestrator,
} from "@superset/cli/types/environment";

export type {
	Agent,
	AgentType,
	Process,
	ProcessOrchestrator,
	ProcessType,
	Terminal,
} from "@superset/cli/types/process";
export { AgentType, ProcessType } from "@superset/cli/types/process";
export type {
	LocalWorkspace,
	Workspace,
	WorkspaceOrchestrator,
	WorkspaceType,
} from "@superset/cli/types/workspace";
export { WorkspaceType } from "@superset/cli/types/workspace";
