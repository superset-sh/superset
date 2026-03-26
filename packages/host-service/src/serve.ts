import { randomBytes } from "node:crypto";
import { serve } from "@hono/node-server";
import { createApp } from "./app";

const dbPath = process.env.HOST_DB_PATH?.trim() || undefined;

// Generate session token for development/standalone mode
// In production (Electron), this is generated in the desktop entry point
const sessionToken =
	process.env.SESSION_TOKEN?.trim() || randomBytes(32).toString("hex");

const { app, injectWebSocket } = createApp({ dbPath, sessionToken });
const port = Number(process.env.PORT) || 4879;

const server = serve({ fetch: app.fetch, port }, (info) => {
	console.log(`[host-service] listening on http://localhost:${info.port}`);
	console.log(
		"[host-service] Authentication enabled. Set SESSION_TOKEN explicitly if you need a fixed token for local testing.",
	);
});
injectWebSocket(server);
