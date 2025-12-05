import type { BrowserWindow } from "electron";
import { router } from "..";
import { createConfigRouter } from "./config";
import { createExternalRouter } from "./external";
import { createNotificationsRouter } from "./notifications";
import { createProjectsRouter } from "./projects";
import { createSettingsRouter } from "./settings";
import { createTerminalRouter } from "./terminal";
import { createWindowRouter } from "./window";
import { createWorkspacesRouter } from "./workspaces";

/**
 * Main application router
 * Combines all domain-specific routers into a single router
 *
 * Uses a getter function to access the current window, allowing
 * window recreation on macOS without stale references.
 */
export const createAppRouter = (getWindow: () => BrowserWindow | null) => {
	return router({
		window: createWindowRouter(getWindow),
		projects: createProjectsRouter(getWindow),
		workspaces: createWorkspacesRouter(),
		terminal: createTerminalRouter(),
		notifications: createNotificationsRouter(),
		external: createExternalRouter(),
		settings: createSettingsRouter(),
		config: createConfigRouter(),
	});
};

export type AppRouter = ReturnType<typeof createAppRouter>;
