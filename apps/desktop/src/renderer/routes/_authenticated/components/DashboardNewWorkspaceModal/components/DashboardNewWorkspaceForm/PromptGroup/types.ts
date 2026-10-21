// v2 ids are runtime host_agent_configs UUIDs, not a static enum like v1.
export type WorkspaceCreateAgent = string;

// New key — old one held v1 preset slugs that won't match v2 UUIDs.
export const AGENT_STORAGE_KEY = "lastSelectedV2WorkspaceCreateAgent";

// JSON map of presetId → model id; keyed by preset (not config UUID) so the
// preference survives host switches.
export const MODEL_STORAGE_KEY = "lastSelectedV2WorkspaceCreateModelByPreset";

// JSON map of presetId → effort id; same contract as MODEL_STORAGE_KEY.
export const EFFORT_STORAGE_KEY = "lastSelectedV2WorkspaceCreateEffortByPreset";

// JSON map of presetId → launch mode id; same contract as MODEL_STORAGE_KEY.
export const MODE_STORAGE_KEY = "lastSelectedV2WorkspaceCreateModeByPreset";

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

/** A repository the organization's GitHub App can see that no project checks out yet. */
export interface GitHubRepositoryOption extends ProjectOption {
	fullName: string;
}

/** How the project picker reaches the GitHub connection: the App's settings, or connecting one. */
export type GitHubConnectionAction =
	| { kind: "configure"; url: string }
	| { kind: "connect" }
	| null;
