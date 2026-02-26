import { EventEmitter } from "node:events";
import { BrowserWindow } from "electron";
import express from "express";
import { handleAuthCallback } from "lib/trpc/routers/auth/utils/auth-functions";
import { NOTIFICATION_EVENTS } from "shared/constants";
import { env } from "shared/env.shared";
import type { AgentLifecycleEvent } from "shared/notification-types";
import { appState } from "../app-state";
import { HOOK_PROTOCOL_VERSION } from "../terminal/env";
import { mapEventType } from "./map-event-type";

// Re-export types for backwards compatibility
export type {
	AgentLifecycleEvent,
	NotificationIds,
} from "shared/notification-types";

/**
 * The environment this server is running in.
 * Used to validate incoming hook requests and detect cross-environment issues.
 */
const SERVER_ENV =
	env.NODE_ENV === "development" ? "development" : "production";
const debugHooksOverride = process.env.SUPERSET_DEBUG_HOOKS?.trim();
const DEBUG_HOOKS_ENABLED =
	debugHooksOverride === undefined
		? SERVER_ENV === "development"
		: !/^(0|false)$/i.test(debugHooksOverride);

export const notificationsEmitter = new EventEmitter();

const app = express();

// Parse JSON request bodies
app.use(express.json());

// CORS
app.use((req, res, next) => {
	res.setHeader("Access-Control-Allow-Origin", "*");
	res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
	if (req.method === "OPTIONS") {
		return res.status(200).end();
	}
	next();
});

/**
 * Resolves paneId from tabId or workspaceId using synced tabs state.
 * Falls back to focused pane in active tab.
 *
 * If a paneId is provided but doesn't exist in state (stale reference),
 * we fall through to tabId/workspaceId resolution instead of returning
 * an invalid paneId that would corrupt the store.
 */
function resolvePaneId(
	paneId: string | undefined,
	tabId: string | undefined,
	workspaceId: string | undefined,
	sessionId: string | undefined,
): string | undefined {
	try {
		const tabsState = appState.data.tabsState;
		if (!tabsState) return undefined;

		// If paneId provided, validate it exists before returning
		if (paneId && tabsState.panes?.[paneId]) {
			return paneId;
		}
		// If paneId was provided but doesn't exist, fall through to resolution

		// Try to resolve from tabId
		if (tabId) {
			const focusedPaneId = tabsState.focusedPaneIds?.[tabId];
			if (focusedPaneId && tabsState.panes?.[focusedPaneId]) {
				return focusedPaneId;
			}
		}

		// Try to resolve from workspaceId
		if (workspaceId) {
			const activeTabId = tabsState.activeTabIds?.[workspaceId];
			if (activeTabId) {
				const focusedPaneId = tabsState.focusedPaneIds?.[activeTabId];
				if (focusedPaneId && tabsState.panes?.[focusedPaneId]) {
					return focusedPaneId;
				}
			}
		}

		// Resolve from Mastra chat session ID
		if (sessionId) {
			for (const [existingPaneId, pane] of Object.entries(
				tabsState.panes ?? {},
			)) {
				if (pane.chatMastra?.sessionId === sessionId) {
					return existingPaneId;
				}
			}
		}
	} catch {
		// App state not initialized yet, ignore
	}

	return undefined;
}

// Agent lifecycle hook
app.get("/hook/complete", (req, res) => {
	const {
		paneId,
		tabId,
		workspaceId,
		sessionId,
		eventType,
		env: clientEnv,
		version,
	} = req.query;

	// Environment validation: detect dev/prod cross-talk
	// We still return success to not block the agent, but log a warning
	if (clientEnv && clientEnv !== SERVER_ENV) {
		console.warn(
			`[notifications] Environment mismatch: received ${clientEnv} request on ${SERVER_ENV} server. ` +
				`This may indicate a stale hook or misconfigured terminal. Ignoring request.`,
		);
		return res.json({ success: true, ignored: true, reason: "env_mismatch" });
	}

	// Log version for debugging (helpful when troubleshooting hook issues)
	if (version && version !== HOOK_PROTOCOL_VERSION) {
		console.log(
			`[notifications] Received hook v${version} request (server expects v${HOOK_PROTOCOL_VERSION})`,
		);
	}

	const mappedEventType = mapEventType(eventType as string | undefined);

	// Unknown or missing eventType: return success but don't process
	// This ensures forward compatibility and doesn't block the agent
	if (!mappedEventType) {
		if (eventType) {
			console.log("[notifications] Ignoring unknown eventType:", eventType);
		}
		return res.json({ success: true, ignored: true });
	}

	const resolvedPaneId = resolvePaneId(
		paneId as string | undefined,
		tabId as string | undefined,
		workspaceId as string | undefined,
		sessionId as string | undefined,
	);

	const event: AgentLifecycleEvent = {
		paneId: resolvedPaneId,
		tabId: tabId as string | undefined,
		workspaceId: workspaceId as string | undefined,
		eventType: mappedEventType,
	};

	if (DEBUG_HOOKS_ENABLED) {
		console.log("[notifications] hook event received", {
			eventType,
			mappedEventType,
			paneId: paneId as string | undefined,
			tabId: tabId as string | undefined,
			workspaceId: workspaceId as string | undefined,
			sessionId: sessionId as string | undefined,
			resolvedPaneId,
		});
	}

	notificationsEmitter.emit(NOTIFICATION_EVENTS.AGENT_LIFECYCLE, event);

	res.json({ success: true, paneId: resolvedPaneId, tabId });
});

// Health check
app.get("/health", (_req, res) => {
	res.json({ status: "ok" });
});

// OAuth callback fallback for Linux/dev environments where custom URI handlers
// are unreliable. Browser can hit localhost directly to complete sign-in.
app.get("/auth/callback", async (req, res) => {
	const token = req.query.token;
	const expiresAt = req.query.expiresAt;
	const state = req.query.state;

	if (
		typeof token !== "string" ||
		typeof expiresAt !== "string" ||
		typeof state !== "string"
	) {
		return res
			.status(400)
			.json({ success: false, error: "Missing auth params" });
	}

	const result = await handleAuthCallback({ token, expiresAt, state });
	if (!result.success) {
		return res.status(400).json(result);
	}

	const mainWindow = BrowserWindow.getAllWindows()[0];
	if (mainWindow) {
		if (mainWindow.isMinimized()) {
			mainWindow.restore();
		}
		mainWindow.show();
		mainWindow.focus();
	}

	// Return HTML since the browser navigated here directly (not fetch).
	res.setHeader("Content-Type", "text/html");
	return res.send(`<!DOCTYPE html>
<html><head><title>Superset</title></head>
<body style="font-family:system-ui,sans-serif;display:flex;justify-content:center;align-items:center;height:100vh;margin:0;background:#0a0a0a;color:#fafafa;">
<div style="text-align:center">
<h2 style="margin-bottom:8px">Signed in successfully</h2>
<p style="opacity:0.6">You can close this tab and return to the desktop app.</p>
</div>
</body></html>`);
});

// 404
app.use((_req, res) => {
	res.status(404).json({ error: "Not found" });
});

export const notificationsApp = app;
