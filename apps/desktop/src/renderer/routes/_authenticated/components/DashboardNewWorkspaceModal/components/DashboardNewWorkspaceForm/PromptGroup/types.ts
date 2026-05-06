// v2 ids are runtime host_agent_configs UUIDs, not a static enum like v1.
export type WorkspaceCreateAgent = string;

// New key — old one held v1 preset slugs that won't match v2 UUIDs.
export const AGENT_STORAGE_KEY = "lastSelectedV2WorkspaceCreateAgent";

export const PILL_BUTTON_CLASS =
	"!h-[22px] min-h-0 rounded-md border-[0.5px] border-border bg-foreground/[0.04] shadow-none text-[11px]";

export interface ProjectOption {
	id: string;
	name: string;
	githubOwner: string | null;
	githubRepoName: string | null;
	iconUrl: string | null;
	// True when the currently-selected host doesn't yet have this project
	// set up. null when we couldn't check (offline / unreachable host).
	needsSetup: boolean | null;
}
