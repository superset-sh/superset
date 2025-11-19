/**
 * Re-export CLI types for Desktop app
 * Uses workspace import for proper monorepo resolution
 */
export type {
	Environment,
	EnvironmentOrchestrator,
} from "@superset/cli/types/environment";

export type {
	Workspace,
	LocalWorkspace,
	WorkspaceType,
	WorkspaceOrchestrator,
} from "@superset/cli/types/workspace";

export type {
	Process,
	ProcessType,
	Terminal,
	Agent,
	AgentType,
	ProcessOrchestrator,
} from "@superset/cli/types/process";

export type {
	Change,
	FileDiff,
	AgentSummary,
	ChangeOrchestrator,
} from "@superset/cli/types/change";

export { WorkspaceType } from "@superset/cli/types/workspace";
export { ProcessType, AgentType } from "@superset/cli/types/process";
