import type { AgentDefinitionId } from "shared/utils/agent-settings";

export type WorkspaceCreateAgent = AgentDefinitionId | "none";

export const AGENT_STORAGE_KEY = "lastSelectedWorkspaceCreateAgent";

export const PILL_BUTTON_CLASS =
	"!h-[22px] min-h-0 rounded-md border-[0.5px] border-border bg-foreground/[0.04] shadow-none text-[11px]";

export interface ProjectOption {
	id: string;
	name: string;
	githubOwner: string | null;
	githubRepoName: string | null;
}
