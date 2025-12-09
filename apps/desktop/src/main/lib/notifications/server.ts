import { EventEmitter } from "node:events";
import express from "express";

export interface AgentCompleteEvent {
	paneId: string;
	workspaceId: string;
	eventType: "Stop" | "PermissionRequest";
}

export const notificationsEmitter = new EventEmitter();

const app = express();

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
	const { paneId, workspaceId, eventType } = req.query;

	if (!paneId || typeof paneId !== "string") {
		return res.status(400).json({ error: "Missing paneId parameter" });
	}

	const event: AgentCompleteEvent = {
		paneId,
		workspaceId: (workspaceId as string) || "",
		eventType: eventType === "PermissionRequest" ? "PermissionRequest" : "Stop",
	};

	notificationsEmitter.emit("agent-complete", event);

	res.json({ success: true, paneId });
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
