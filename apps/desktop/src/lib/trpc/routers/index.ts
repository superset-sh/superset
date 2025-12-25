import type { BrowserWindow } from "electron";
import { router } from "..";
import { createAnalyticsRouter } from "./analytics";
import { createAuthRouter } from "./auth";
import { createChangesRouter } from "./changes";
import { createConfigRouter } from "./config";
import { createExternalRouter } from "./external";
import { createMenuRouter } from "./menu";
import { createNotificationsRouter } from "./notifications";
import { createPortsRouter } from "./ports";
import { createProjectsRouter } from "./projects";
import { createRingtoneRouter } from "./ringtone";
import { createSettingsRouter } from "./settings";
import { createTerminalRouter } from "./terminal";
import { createUiStateRouter } from "./ui-state";
import { createUserRouter } from "./user";
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
		analytics: createAnalyticsRouter(),
		auth: createAuthRouter(getWindow),
		user: createUserRouter(),
		window: createWindowRouter(getWindow),
		projects: createProjectsRouter(getWindow),
		workspaces: createWorkspacesRouter(),
		terminal: createTerminalRouter(),
		changes: createChangesRouter(),
		notifications: createNotificationsRouter(),
		ports: createPortsRouter(),
		menu: createMenuRouter(),
		external: createExternalRouter(),
		settings: createSettingsRouter(),
		config: createConfigRouter(),
		uiState: createUiStateRouter(),
		ringtone: createRingtoneRouter(),
	});
};

export type AppRouter = ReturnType<typeof createAppRouter>;
