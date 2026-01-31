import { PROTOCOL_SCHEMES } from "@superset/shared/constants";
import { env } from "./env.shared";
import { getWorkspaceName } from "./worktree-id";

export const PLATFORM = {
	IS_MAC: process.platform === "darwin",
	IS_WINDOWS: process.platform === "win32",
	IS_LINUX: process.platform === "linux",
};

// Ports - read from env vars set by setup.sh for multi-worktree support
// Defaults (5927, 31416) preserved for running outside Superset terminals
export const PORTS = {
	VITE_DEV_SERVER: Number(env.DESKTOP_VITE_PORT) || 5927,
	NOTIFICATIONS: Number(env.DESKTOP_NOTIFICATIONS_PORT) || 31416,
	// Electric SQL proxy port (local-first sync) - not yet workspace-isolated
	ELECTRIC: 31418,
};

/**
 * Get the Superset home directory name.
 * When running in a named workspace, returns `.superset-{workspace}` for isolation.
 * Otherwise returns `.superset`.
 */
function getSupersetDirName(): string {
	const workspace = getWorkspaceName();
	if (workspace) {
		return `.superset-${workspace}`;
	}
	return ".superset";
}

// Note: For environment-aware paths, use main/lib/app-environment.ts instead.
// Paths require Node.js/Electron APIs that aren't available in renderer.
export const SUPERSET_DIR_NAME = getSupersetDirName();

// Static directory names for filtering wrapper scripts (used by agent-setup)
// These are the known directories that may contain wrapper scripts
export const SUPERSET_DIR_NAMES = {
	PROD: ".superset",
	DEV: ".superset-dev",
} as const;

// Deep link protocol scheme (environment-aware)
export const PROTOCOL_SCHEME =
	env.NODE_ENV === "development" ? PROTOCOL_SCHEMES.DEV : PROTOCOL_SCHEMES.PROD;
// Project-level directory name (always .superset, not conditional)
export const PROJECT_SUPERSET_DIR_NAME = ".superset";
export const WORKTREES_DIR_NAME = "worktrees";
export const CONFIG_FILE_NAME = "config.json";
export const PORTS_FILE_NAME = "ports.json";

export const CONFIG_TEMPLATE = `{
  "setup": [],
  "teardown": []
}`;

export const NOTIFICATION_EVENTS = {
	AGENT_LIFECYCLE: "agent-lifecycle",
	FOCUS_TAB: "focus-tab",
	TERMINAL_EXIT: "terminal-exit",
} as const;

// Development/testing mock values (used when SKIP_ENV_VALIDATION is set)
export const MOCK_ORG_ID = "mock-org-id";

// Default user preference values
export const DEFAULT_CONFIRM_ON_QUIT = true;
export const DEFAULT_TERMINAL_LINK_BEHAVIOR = "external-editor" as const;
export const DEFAULT_TERMINAL_PERSISTENCE = true;
export const DEFAULT_AUTO_APPLY_DEFAULT_PRESET = true;

// External links (documentation, help resources, etc.)
export const EXTERNAL_LINKS = {
	SETUP_TEARDOWN_SCRIPTS: `${process.env.NEXT_PUBLIC_DOCS_URL}/setup-teardown-scripts`,
} as const;
