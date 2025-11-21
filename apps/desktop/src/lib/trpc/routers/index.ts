import type { BrowserWindow } from "electron";
import { router } from "..";
import { createWindowRouter } from "./window";
import { createProjectsRouter } from "./projects";
import { createWorkspacesRouter } from "./workspaces";
import { createTerminalRouter } from "./terminal";

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
	});
};

export type AppRouter = ReturnType<typeof createAppRouter>;
