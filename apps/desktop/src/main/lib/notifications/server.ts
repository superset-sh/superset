import { EventEmitter } from "node:events";
import express from "express";
import { NOTIFICATION_EVENTS } from "shared/constants";
import { debugLog } from "shared/debug";
import { env } from "shared/env.shared";
import type { AgentLifecycleEvent } from "shared/notification-types";
import { appState } from "../app-state";
import { HOOK_PROTOCOL_VERSION } from "../terminal/env";

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
 * Maps incoming event types to canonical lifecycle events.
 * Handles variations from different agent CLIs.
 *
 * Returns null for unknown events - caller should ignore these gracefully
 * to maintain forward compatibility with newer hook versions.
 *
 * Note: We no longer default missing eventType to "Stop" to prevent
 * parse failures from being treated as completions.
 *
 * @internal Exported for testing
 */
export function mapEventType(
	eventType: string | undefined,
): "Start" | "Stop" | "PermissionRequest" | null {
	if (!eventType) {
		return null; // Missing eventType should be ignored, not treated as Stop
	}
	if (eventType === "Start" || eventType === "UserPromptSubmit") {
		return "Start";
	}
	if (eventType === "PermissionRequest") {
		return "PermissionRequest";
	}
	if (eventType === "Stop" || eventType === "agent-turn-complete") {
		return "Stop";
	}
	return null; // Unknown events are ignored for forward compatibility
}

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

	debugLog("notifications", "Received hook:", {
		eventType,
		mappedEventType,
		paneId,
		tabId,
		workspaceId,
	});

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
	);

	const event: AgentLifecycleEvent = {
		paneId: resolvedPaneId,
		tabId: tabId as string | undefined,
		workspaceId: workspaceId as string | undefined,
		eventType: mappedEventType,
	};

	notificationsEmitter.emit(NOTIFICATION_EVENTS.AGENT_LIFECYCLE, event);

	res.json({ success: true, paneId: resolvedPaneId, tabId });
});

// Health check
app.get("/health", (_req, res) => {
	res.json({ status: "ok" });
});

// 404
app.use((_req, res) => {
	res.status(404).json({ error: "Not found" });
});

export const notificationsApp = app;
