export const ENVIRONMENT = {
	IS_DEV: process.env.NODE_ENV === "development",
};

export const PLATFORM = {
	IS_MAC: process.platform === "darwin",
	IS_WINDOWS: process.platform === "win32",
	IS_LINUX: process.platform === "linux",
};

// Note: For environment-aware paths and ports, use main/lib/app-environment.ts instead.
// These constants are for code that runs in both main and renderer processes.
export const SUPERSET_DIR_NAME = ".superset";
export const WORKTREES_DIR_NAME = "worktrees";
