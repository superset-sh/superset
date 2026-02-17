import type { BrowserWindow } from "electron";
import { router } from "..";
import { createAiChatRouter } from "./ai-chat";
import { createAnalyticsRouter } from "./analytics";
import { createAuthRouter } from "./auth";
import { createAutoUpdateRouter } from "./auto-update";
import { createBrowserRouter } from "./browser/browser";
import { createBrowserHistoryRouter } from "./browser-history";
import { createCacheRouter } from "./cache";
import { createChangesRouter } from "./changes";
import { createConfigRouter } from "./config";
import { createExternalRouter } from "./external";
import { createFilesystemRouter } from "./filesystem";
import { createHotkeysRouter } from "./hotkeys";
import { createMenuRouter } from "./menu";
import { createNotificationsRouter } from "./notifications";
import { createPortsRouter } from "./ports";
import { createProjectsRouter } from "./projects";
import { createRingtoneRouter } from "./ringtone";
import { createSettingsRouter } from "./settings";
import { createTerminalRouter } from "./terminal";
import { createUiStateRouter } from "./ui-state";
import { createWindowRouter } from "./window";
import { createWorkspacesRouter } from "./workspaces";

export const createAppRouter = (getWindow: () => BrowserWindow | null) => {
	return router({
		aiChat: createAiChatRouter(),
		analytics: createAnalyticsRouter(),
		browser: createBrowserRouter(),
		browserHistory: createBrowserHistoryRouter(),
		auth: createAuthRouter(),
		autoUpdate: createAutoUpdateRouter(),
		cache: createCacheRouter(),
		window: createWindowRouter(getWindow),
		projects: createProjectsRouter(getWindow),
		workspaces: createWorkspacesRouter(),
		terminal: createTerminalRouter(),
		changes: createChangesRouter(),
		filesystem: createFilesystemRouter(),
		notifications: createNotificationsRouter(),
		ports: createPortsRouter(),
		menu: createMenuRouter(),
		hotkeys: createHotkeysRouter(getWindow),
		external: createExternalRouter(),
		settings: createSettingsRouter(),
		config: createConfigRouter(),
		uiState: createUiStateRouter(),
		ringtone: createRingtoneRouter(),
	});
};

export type AppRouter = ReturnType<typeof createAppRouter>;
