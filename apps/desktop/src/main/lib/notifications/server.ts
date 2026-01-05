import { EventEmitter } from "node:events";
import express from "express";
import { NOTIFICATION_EVENTS } from "shared/constants";
import { validateAndReadPlanFile } from "../plans";

export interface NotificationIds {
	paneId?: string;
	tabId?: string;
	workspaceId?: string;
}

export interface AgentCompleteEvent extends NotificationIds {
	eventType: "Stop" | "PermissionRequest";
}

export interface PlanSubmittedEvent {
	content: string;
	planId: string;
	originPaneId: string;
	summary?: string;
	agentType: "opencode" | "claude";
	workspaceId?: string;
}

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

// Agent completion hook
app.get("/hook/complete", (req, res) => {
	const { paneId, tabId, workspaceId, eventType } = req.query;

	const event: AgentCompleteEvent = {
		paneId: paneId as string | undefined,
		tabId: tabId as string | undefined,
		workspaceId: workspaceId as string | undefined,
		eventType: eventType === "PermissionRequest" ? "PermissionRequest" : "Stop",
	};

	notificationsEmitter.emit(NOTIFICATION_EVENTS.AGENT_COMPLETE, event);

	res.json({ success: true, paneId, tabId });
});

// Plan submission hook
app.post("/hook/plan", async (req, res) => {
	const { planId, planPath, summary, originPaneId, agentType, workspaceId } =
		req.body;

	if (!planPath || !planId) {
		res.status(400).json({ error: "Missing planPath or planId" });
		return;
	}

	// Validate and read plan file securely
	const result = await validateAndReadPlanFile(planPath);

	if (!result.ok) {
		console.warn(`[notifications] Invalid plan file: ${result.error}`);
		res.status(400).json({ error: result.error });
		return;
	}

	const event: PlanSubmittedEvent = {
		content: result.content,
		planId,
		originPaneId: originPaneId || "",
		summary,
		agentType: agentType === "claude" ? "claude" : "opencode",
		workspaceId,
	};

	notificationsEmitter.emit(NOTIFICATION_EVENTS.PLAN_SUBMITTED, event);

	res.json({ success: true, planId });
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
