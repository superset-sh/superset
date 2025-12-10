export const ENVIRONMENT = {
	IS_DEV: process.env.NODE_ENV === "development",
};

export const PLATFORM = {
	IS_MAC: process.platform === "darwin",
	IS_WINDOWS: process.platform === "win32",
	IS_LINUX: process.platform === "linux",
};

// Ports - different for dev vs prod to allow running both simultaneously
export const PORTS = {
	// Vite dev server port
	VITE_DEV_SERVER: ENVIRONMENT.IS_DEV ? 5927 : 4927,
	// Notification HTTP server port
	NOTIFICATIONS: ENVIRONMENT.IS_DEV ? 31416 : 31415,
};

// Note: For environment-aware paths, use main/lib/app-environment.ts instead.
// Paths require Node.js/Electron APIs that aren't available in renderer.
export const SUPERSET_DIR_NAMES = {
	DEV: ".superset-dev",
	PROD: ".superset",
} as const;
export const SUPERSET_DIR_NAME = ENVIRONMENT.IS_DEV
	? SUPERSET_DIR_NAMES.DEV
	: SUPERSET_DIR_NAMES.PROD;
// Project-level directory name (always .superset, not conditional)
export const PROJECT_SUPERSET_DIR_NAME = ".superset";
export const WORKTREES_DIR_NAME = "worktrees";
export const CONFIG_FILE_NAME = "config.json";

// Website URL - defaults to production, can be overridden via env var for local dev
export const WEBSITE_URL = process.env.WEBSITE_URL || "https://superset.sh";

// Help menu URLs
export const HELP_MENU = {
	CONTACT_URL: "https://x.com/superset_sh",
	REPORT_ISSUE_URL: "https://github.com/superset-sh/superset/issues/new",
	DISCORD_URL: "https://discord.gg/cZeD9WYcV7",
} as const;

// Config file template
export const CONFIG_TEMPLATE = `{
  "setup": [],
  "teardown": []
}`;
