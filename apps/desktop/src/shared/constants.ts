import { PROTOCOL_SCHEMES } from "@superset/shared/constants";
import { getWorkspaceName } from "./env.shared";

export const PLATFORM = {
	IS_MAC: process.platform === "darwin",
	IS_WINDOWS: process.platform === "win32",
	IS_LINUX: process.platform === "linux",
};

const workspace = getWorkspaceName();
export const SUPERSET_DIR_NAME = workspace
	? `.superset-${workspace}`
	: ".superset";
export const PROTOCOL_SCHEME = workspace
	? `superset-${workspace}`
	: PROTOCOL_SCHEMES.PROD;
// Project-level directory name (always .superset, not conditional)
export const PROJECT_SUPERSET_DIR_NAME = ".superset";
export const WORKTREES_DIR_NAME = "worktrees";
export const PROJECTS_DIR_NAME = "projects";
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
export const DEFAULT_FILE_OPEN_MODE = "split-pane" as const;
export const DEFAULT_AUTO_APPLY_DEFAULT_PRESET = true;
export const DEFAULT_SHOW_PRESETS_BAR = false;
export const DEFAULT_TELEMETRY_ENABLED = true;
export const DEFAULT_SHOW_RESOURCE_MONITOR = false;
export const DEFAULT_OPEN_LINKS_IN_APP = false;

// External links (documentation, help resources, etc.)
export const EXTERNAL_LINKS = {
	SETUP_TEARDOWN_SCRIPTS: `${process.env.NEXT_PUBLIC_DOCS_URL}/setup-teardown-scripts`,
} as const;
