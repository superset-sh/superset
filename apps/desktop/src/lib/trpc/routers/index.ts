import type { BrowserWindow } from "electron";
import { router } from "..";
import { createAnalyticsRouter } from "./analytics";
import { createAuthRouter } from "./auth";
import { createAutoUpdateRouter } from "./auto-update";
import { createBrowserRouter } from "./browser/browser";
import { createBrowserHistoryRouter } from "./browser-history";
import { createChangesRouter } from "./changes";
import { createConfigRouter } from "./config";
import { createDeviceRouter } from "./device";
import { createDownloadsRouter } from "./downloads";
import { createExternalRouter } from "./external";
import { createFilesystemRouter } from "./filesystem";
import { createGithubStarRouter } from "./github-star";
import { createHostServiceCoordinatorRouter } from "./host-service-coordinator";
import { createKeyboardLayoutRouter } from "./keyboardLayout";
import { createMenuRouter } from "./menu";
import { createMigrationRouter } from "./migration";
import { createNotificationsRouter } from "./notifications";
import { createPermissionsRouter } from "./permissions";
import { createPluginsRouter } from "./plugins";
import { createPortForwardsRouter } from "./port-forwards";
import { createPortsRouter } from "./ports";
import { createProjectsRouter } from "./projects";
import { createResourceMetricsRouter } from "./resource-metrics";
import { createRingtoneRouter } from "./ringtone";
import { createScreenshotsRouter } from "./screenshots";
import { createSettingsRouter } from "./settings";
import { createSystemRouter } from "./system";
import { createTerminalRouter } from "./terminal";
import { createUiStateRouter } from "./ui-state";
import { createWindowRouter } from "./window";
import { createWorkspacesRouter } from "./workspaces";

export const createAppRouter = (getWindow: () => BrowserWindow | null) => {
	return router({
		analytics: createAnalyticsRouter(),
		browser: createBrowserRouter(),
		browserHistory: createBrowserHistoryRouter(),
		downloads: createDownloadsRouter(),
		screenshots: createScreenshotsRouter(),
		auth: createAuthRouter(),
		autoUpdate: createAutoUpdateRouter(),
		window: createWindowRouter(),
		projects: createProjectsRouter(getWindow),
		workspaces: createWorkspacesRouter(),
		terminal: createTerminalRouter(),
		changes: createChangesRouter(),
		filesystem: createFilesystemRouter(),
		notifications: createNotificationsRouter(getWindow),
		permissions: createPermissionsRouter(),
		plugins: createPluginsRouter(),
		ports: createPortsRouter(),
		portForwards: createPortForwardsRouter(),
		resourceMetrics: createResourceMetricsRouter(),
		menu: createMenuRouter(),
		external: createExternalRouter(),
		githubStar: createGithubStarRouter(),
		settings: createSettingsRouter(),
		system: createSystemRouter(),
		config: createConfigRouter(),
		device: createDeviceRouter(),
		uiState: createUiStateRouter(),
		ringtone: createRingtoneRouter(getWindow),
		hostServiceCoordinator: createHostServiceCoordinatorRouter(),
		keyboardLayout: createKeyboardLayoutRouter(),
		migration: createMigrationRouter(),
	});
};

export type AppRouter = ReturnType<typeof createAppRouter>;
