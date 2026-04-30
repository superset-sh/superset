import type { AgentDefinitionId } from "@superset/shared/agent-settings";

export type WorkspaceCreateAgent = AgentDefinitionId | "none";

export const AGENT_STORAGE_KEY = "lastSelectedWorkspaceCreateAgent";

export const PILL_BUTTON_CLASS =
	"!h-[22px] min-h-0 rounded-md border-[0.5px] border-border bg-foreground/[0.04] shadow-none text-tiny";

export const PILL_ICON_BUTTON_CLASS = `${PILL_BUTTON_CLASS} w-[22px]`;

export interface ProjectOption {
	id: string;
	name: string;
	githubOwner: string | null;
	githubRepoName: string | null;
	// True when the currently-selected host doesn't yet have this project
	// set up. null when we couldn't check (offline / unreachable host).
	needsSetup: boolean | null;
}
