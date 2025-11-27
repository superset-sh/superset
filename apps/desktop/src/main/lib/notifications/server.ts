import { EventEmitter } from "node:events";
import express from "express";
import { NOTIFICATIONS_PORT } from "../app-environment";

export interface AgentCompleteEvent {
	tabId: string;
	tabTitle: string;
	workspaceName: string;
	workspaceId: string;
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
	const { tabId, tabTitle, workspaceName, workspaceId } = req.query;

	if (!tabId || typeof tabId !== "string") {
		return res.status(400).json({ error: "Missing tabId parameter" });
	}

	const event: AgentCompleteEvent = {
		tabId,
		tabTitle: (tabTitle as string) || "Terminal",
		workspaceName: (workspaceName as string) || "Workspace",
		workspaceId: (workspaceId as string) || "",
	};

	notificationsEmitter.emit("agent-complete", event);

	res.json({ success: true, tabId });
});

// Health check
app.get("/health", (req, res) => {
	res.json({ status: "ok" });
});

// 404
app.use((req, res) => {
	res.status(404).json({ error: "Not found" });
});

export const notificationsApp = app;
export { NOTIFICATIONS_PORT };
