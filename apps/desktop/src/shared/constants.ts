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
export const SUPERSET_DIR_NAME = ENVIRONMENT.IS_DEV
	? ".superset-dev"
	: ".superset";
export const WORKTREES_DIR_NAME = "worktrees";

// Website URL - defaults to production, can be overridden via env var for local dev
export const WEBSITE_URL = process.env.WEBSITE_URL || "https://superset.sh";
