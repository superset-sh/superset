import type { BrowserWindow } from "electron";
import { router } from "..";
import { createChangesRouter } from "./changes";
import { createConfigRouter } from "./config";
import { createExternalRouter } from "./external";
import { createMenuRouter } from "./menu";
import { createNotificationsRouter } from "./notifications";
import { createProjectsRouter } from "./projects";
import { createRingtoneRouter } from "./ringtone";
import { createSettingsRouter } from "./settings";
import { createSSHRouter } from "./ssh";
import { createTerminalRouter } from "./terminal";
import { createUiStateRouter } from "./ui-state";
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
		ssh: createSSHRouter(),
		changes: createChangesRouter(),
		notifications: createNotificationsRouter(),
		menu: createMenuRouter(),
		external: createExternalRouter(),
		settings: createSettingsRouter(),
		config: createConfigRouter(),
		uiState: createUiStateRouter(),
		ringtone: createRingtoneRouter(),
	});
};

export type AppRouter = ReturnType<typeof createAppRouter>;
