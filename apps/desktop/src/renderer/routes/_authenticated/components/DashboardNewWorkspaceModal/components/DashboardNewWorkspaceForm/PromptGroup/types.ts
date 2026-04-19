import type { AgentDefinitionId } from "shared/utils/agent-settings";

export type WorkspaceCreateAgent = AgentDefinitionId | "none";

export const AGENT_STORAGE_KEY = "lastSelectedWorkspaceCreateAgent";

export const PILL_BUTTON_CLASS =
	"!h-[22px] min-h-0 rounded-md border-[0.5px] border-border bg-foreground/[0.04] shadow-none text-[11px]";

// Shared trigger style for the top-of-modal pickers (Device / Project / Branch).
// No background; uniform icon size, text size, and text color so the three
// pickers read as one segmented control.
export const FORM_PICKER_TRIGGER_CLASS =
	"inline-flex items-center gap-1 h-[22px] text-[11px] text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50 min-w-0";

export interface ProjectOption {
	id: string;
	name: string;
	githubOwner: string | null;
	githubRepoName: string | null;
}
