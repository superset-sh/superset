import type { BrowserWindow } from "electron";
import { router } from "..";
import { createExternalRouter } from "./external";
import { createNotificationsRouter } from "./notifications";
import { createProjectsRouter } from "./projects";
import { createTerminalRouter } from "./terminal";
import { createWindowRouter } from "./window";
import { createWorkspacesRouter } from "./workspaces";

/**
 * Main application router
 * Combines all domain-specific routers into a single router
 */
export const createAppRouter = (window: BrowserWindow) => {
	return router({
		window: createWindowRouter(window),
		projects: createProjectsRouter(window),
		workspaces: createWorkspacesRouter(),
		terminal: createTerminalRouter(),
		notifications: createNotificationsRouter(),
		external: createExternalRouter(),
	});
};

export type AppRouter = ReturnType<typeof createAppRouter>;
