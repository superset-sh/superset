import type { BrowserWindow } from "electron";
import { router } from "..";
import { createAnalyticsRouter } from "./analytics";
import { createAuthRouter } from "./auth";
import { createAutoUpdateRouter } from "./auto-update";
import { createChangesRouter } from "./changes";
import { createConfigRouter } from "./config";
import { createExternalRouter } from "./external";
import { createHotkeysRouter } from "./hotkeys";
import { createMenuRouter } from "./menu";
import { createNotificationsRouter } from "./notifications";
import { createPortsRouter } from "./ports";
import { createProjectsRouter } from "./projects";
import { createRingtoneRouter } from "./ringtone";
import { createSettingsRouter } from "./settings";
import { createTasksRouter } from "./tasks";
import { createTerminalRouter } from "./terminal";
import { createUiStateRouter } from "./ui-state";
import { createUserRouter } from "./user";
import { createWindowRouter } from "./window";
import { createWorkspacesRouter } from "./workspaces";

export const createAppRouter = (getWindow: () => BrowserWindow | null) => {
	return router({
		analytics: createAnalyticsRouter(),
		auth: createAuthRouter(getWindow),
		autoUpdate: createAutoUpdateRouter(),
		user: createUserRouter(),
		window: createWindowRouter(getWindow),
		projects: createProjectsRouter(getWindow),
		workspaces: createWorkspacesRouter(),
		terminal: createTerminalRouter(),
		changes: createChangesRouter(),
		notifications: createNotificationsRouter(),
		ports: createPortsRouter(),
		menu: createMenuRouter(),
		hotkeys: createHotkeysRouter(getWindow),
		external: createExternalRouter(),
		settings: createSettingsRouter(),
		config: createConfigRouter(),
		uiState: createUiStateRouter(),
		ringtone: createRingtoneRouter(),
		tasks: createTasksRouter(),
	});
};

export type AppRouter = ReturnType<typeof createAppRouter>;
