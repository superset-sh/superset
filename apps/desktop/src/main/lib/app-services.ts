import { workspaces, worktrees } from "@superset/local-db";
import { eq } from "drizzle-orm";
import { Notification } from "electron";
import { NOTIFICATION_EVENTS } from "shared/constants";
import { env } from "shared/env.shared";
import type { AgentLifecycleEvent } from "shared/notification-types";
import {
	getAllManagedWindows,
	getFocusedManagedWindow,
} from "../windows/manager";
import { appState } from "./app-state";
import { localDb } from "./local-db";
import { playNotificationSound } from "./notification-sound";
import { NotificationManager } from "./notifications/notification-manager";
import { notificationsApp, notificationsEmitter } from "./notifications/server";
import {
	extractWorkspaceIdFromUrl,
	getNotificationTitle,
	getWorkspaceName,
} from "./notifications/utils";
import { getWorkspaceRuntimeRegistry } from "./workspace-runtime";

let started = false;
let server: ReturnType<typeof notificationsApp.listen> | null = null;
let notificationManager: NotificationManager | null = null;
let terminalExitHandler: ((event: TerminalExitEvent) => void) | null = null;

interface TerminalExitEvent {
	paneId: string;
	exitCode: number;
	signal?: number;
	reason?: "killed" | "exited" | "error";
}

function getWorkspaceNameFromDb(workspaceId: string | undefined): string {
	if (!workspaceId) return "Workspace";
	try {
		const workspace = localDb
			.select()
			.from(workspaces)
			.where(eq(workspaces.id, workspaceId))
			.get();
		const worktree = workspace?.worktreeId
			? localDb
					.select()
					.from(worktrees)
					.where(eq(worktrees.id, workspace.worktreeId))
					.get()
			: undefined;
		return getWorkspaceName({ workspace, worktree });
	} catch (error) {
		console.error("[app-services] Failed to get workspace name:", error);
		return "Workspace";
	}
}

/**
 * Find the window currently displaying the given workspace, if any.
 * Falls back to focused/most-recent window when no exact match.
 */
function findWindowForWorkspace(
	workspaceId: string | null,
): Electron.BrowserWindow | null {
	if (workspaceId) {
		const all = getAllManagedWindows();
		const match = all.find(
			(m) =>
				m.workspaceId === workspaceId ||
				extractWorkspaceIdFromUrl(m.window.webContents.getURL()) ===
					workspaceId,
		);
		if (match) return match.window;
	}
	const focused = getFocusedManagedWindow();
	return focused?.window ?? null;
}

/**
 * Initializes app-level services that must exist before any window opens
 * and survive any single window's lifecycle. Idempotent.
 *
 * - Notifications HTTP server (single port, can't be per-window)
 * - NotificationManager (de-dups + routes click events)
 * - Terminal exit forwarder
 */
export function initAppServices(): void {
	if (started) return;
	started = true;

	server = notificationsApp.listen(
		env.DESKTOP_NOTIFICATIONS_PORT,
		"127.0.0.1",
		() => {
			console.log(
				`[notifications] Listening on http://127.0.0.1:${env.DESKTOP_NOTIFICATIONS_PORT}`,
			);
		},
	);
	// Without this handler an EADDRINUSE (e.g. a prod Superset instance already
	// bound to the port while a dev build starts) becomes an unhandled 'error'
	// event and crashes the whole main process. Agent hooks and the OAuth
	// fallback degrade gracefully when the server is absent.
	server.on("error", (error: NodeJS.ErrnoException) => {
		if (error.code === "EADDRINUSE") {
			console.error(
				`[notifications] Port ${env.DESKTOP_NOTIFICATIONS_PORT} already in use — ` +
					"another Superset instance is likely running. Agent lifecycle " +
					"notifications and the OAuth callback fallback are disabled in " +
					"this instance. Set DESKTOP_NOTIFICATIONS_PORT to use another port.",
			);
		} else {
			console.error("[notifications] Server error:", error);
		}
		server = null;
	});

	notificationManager = new NotificationManager({
		isSupported: () => Notification.isSupported(),
		createNotification: (opts) => new Notification(opts),
		playSound: playNotificationSound,
		onNotificationClick: (ids) => {
			const target = findWindowForWorkspace(ids.workspaceId ?? null);
			if (target) {
				if (target.isMinimized()) target.restore();
				target.show();
				target.focus();
			}
			if (ids.workspaceId && ids.terminalId) {
				notificationsEmitter.emit(
					NOTIFICATION_EVENTS.FOCUS_V2_NOTIFICATION_SOURCE,
					{
						workspaceId: ids.workspaceId,
						source: { type: "terminal", id: ids.terminalId },
					},
				);
				return;
			}
			notificationsEmitter.emit(NOTIFICATION_EVENTS.FOCUS_TAB, ids);
		},
		// TODO(multi-window): visibility derives from the focused window only.
		// A pane visible in an unfocused secondary window is treated as hidden
		// (extra notification) — needs a per-window visibility API to fix.
		getVisibilityContext: () => {
			const focused = getFocusedManagedWindow();
			const win = focused?.window;
			return {
				isFocused: win?.isFocused() ?? false,
				currentWorkspaceId: win
					? extractWorkspaceIdFromUrl(win.webContents.getURL())
					: null,
				tabsState: appState.data?.tabsState,
			};
		},
		getWorkspaceName: getWorkspaceNameFromDb,
		getNotificationTitle: (event) =>
			getNotificationTitle({
				tabId: event.tabId,
				paneId: event.paneId,
				tabs: appState.data?.tabsState?.tabs,
				panes: appState.data?.tabsState?.panes,
			}),
	});
	notificationManager.start();

	notificationsEmitter.on(
		NOTIFICATION_EVENTS.AGENT_LIFECYCLE,
		(event: AgentLifecycleEvent) => {
			notificationManager?.handleAgentLifecycle(event);
		},
	);

	// Forward low-volume terminal lifecycle events to renderers via the existing
	// notifications subscription. Used for correctness (e.g. clearing stuck agent
	// lifecycle statuses when terminal panes aren't mounted).
	// Handler ref is kept so dispose can detach exactly this listener — a blanket
	// detachAllListeners() would also strip listeners owned by the terminal runtime.
	terminalExitHandler = (event: TerminalExitEvent) => {
		notificationsEmitter.emit(NOTIFICATION_EVENTS.TERMINAL_EXIT, {
			paneId: event.paneId,
			exitCode: event.exitCode,
			signal: event.signal,
			reason: event.reason,
		});
	};
	getWorkspaceRuntimeRegistry()
		.getDefault()
		.terminal.on("terminalExit", terminalExitHandler);
}

/** Tear down at app quit. Safe to call multiple times. */
export function disposeAppServices(): void {
	if (!started) return;
	started = false;
	try {
		server?.close();
		server = null;
	} catch (error) {
		console.error("[app-services] Failed to close server:", error);
	}
	try {
		notificationManager?.dispose();
		notificationManager = null;
	} catch (error) {
		console.error(
			"[app-services] Failed to dispose notification manager:",
			error,
		);
	}
	notificationsEmitter.removeAllListeners();
	if (terminalExitHandler) {
		try {
			getWorkspaceRuntimeRegistry()
				.getDefault()
				.terminal.off("terminalExit", terminalExitHandler);
		} catch (error) {
			console.error(
				"[app-services] Failed to detach terminal listener:",
				error,
			);
		}
		terminalExitHandler = null;
	}
}
