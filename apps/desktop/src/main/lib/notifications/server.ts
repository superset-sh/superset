import { EventEmitter } from "node:events";
import { BrowserWindow } from "electron";
import express from "express";
import { handleAuthCallback } from "lib/trpc/routers/auth/utils/auth-functions";
import { reloadThemeStateFromDisk } from "main/lib/app-state";

/**
 * Broadcasts normalized agent lifecycle events from the local hook server.
 */
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

// External settings change (e.g. `superset settings ...` CLI). Reads no
// request data — it only re-reads local files and tells the renderer to
// refresh, so an unauthenticated localhost nudge is safe.
app.post("/settings-changed", (_req, res) => {
	const themeState = reloadThemeStateFromDisk();
	// Emit even when the theme reload failed: local.db settings may still
	// have changed, and the renderer refresh is driven by this event.
	notificationsEmitter.emit("settings-external-change", { themeState });
	res.json({ success: true, themeReloaded: themeState !== null });
});

// 404
app.use((_req, res) => {
	res.status(404).json({ error: "Not found" });
});

/**
 * Exposes the notifications Express app for startup and tests.
 */
export const notificationsApp = app;
