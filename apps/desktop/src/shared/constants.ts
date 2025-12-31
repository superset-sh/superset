import { PROTOCOL_SCHEMES } from "@superset/shared/constants";
import { env } from "./env.shared";

export const PLATFORM = {
	IS_MAC: process.platform === "darwin",
	IS_WINDOWS: process.platform === "win32",
	IS_LINUX: process.platform === "linux",
};

// Ports - different for dev vs prod to allow running both simultaneously
export const PORTS = {
	VITE_DEV_SERVER: env.NODE_ENV === "development" ? 5927 : 4927,
	NOTIFICATIONS: env.NODE_ENV === "development" ? 31416 : 31415,
	// Electric SQL proxy port (local-first sync)
	ELECTRIC: env.NODE_ENV === "development" ? 31418 : 31417,
};

// Note: For environment-aware paths, use main/lib/app-environment.ts instead.
// Paths require Node.js/Electron APIs that aren't available in renderer.
export const SUPERSET_DIR_NAMES = {
	DEV: ".superset-dev",
	PROD: ".superset",
} as const;
export const SUPERSET_DIR_NAME =
	env.NODE_ENV === "development"
		? SUPERSET_DIR_NAMES.DEV
		: SUPERSET_DIR_NAMES.PROD;

// Deep link protocol scheme (environment-aware)
export const PROTOCOL_SCHEME =
	env.NODE_ENV === "development" ? PROTOCOL_SCHEMES.DEV : PROTOCOL_SCHEMES.PROD;
// Project-level directory name (always .superset, not conditional)
export const PROJECT_SUPERSET_DIR_NAME = ".superset";
export const WORKTREES_DIR_NAME = "worktrees";
export const CONFIG_FILE_NAME = "config.json";

export const CONFIG_TEMPLATE = `{
  "setup": [],
  "teardown": []
}`;

export const NOTIFICATION_EVENTS = {
	AGENT_COMPLETE: "agent-complete",
	FOCUS_TAB: "focus-tab",
} as const;

// Default user preference values
export const DEFAULT_CONFIRM_ON_QUIT = true;
export const DEFAULT_TERMINAL_LINK_BEHAVIOR = "external-editor" as const;
export const DEFAULT_NAVIGATION_STYLE = "top-bar" as const;
