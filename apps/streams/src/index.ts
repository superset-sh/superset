import { existsSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { DurableStreamTestServer } from "@durable-streams/server";
import { serve } from "@hono/node-server";
import { claudeAgentApp } from "./claude-agent";
import { createServer } from "./server";

const PORT = parseInt(process.env.PORT ?? "8080", 10);
const INTERNAL_PORT = parseInt(process.env.INTERNAL_PORT ?? "8081", 10);
const AGENT_PORT = parseInt(process.env.CLAUDE_AGENT_PORT ?? "9090", 10);
const DURABLE_STREAMS_URL =
	process.env.DURABLE_STREAMS_URL ?? `http://127.0.0.1:${INTERNAL_PORT}`;

const DATA_DIR =
	process.env.DURABLE_STREAMS_DATA_DIR ??
	join(homedir(), ".superset", "chat-streams");

if (!existsSync(DATA_DIR)) {
	mkdirSync(DATA_DIR, { recursive: true });
}

const durableStreamServer = new DurableStreamTestServer({
	port: INTERNAL_PORT,
	dataDir: DATA_DIR,
});
await durableStreamServer.start();
console.log(`[streams] Durable stream server on port ${INTERNAL_PORT}`);

const { app } = createServer({
	baseUrl: DURABLE_STREAMS_URL,
	cors: true,
	logging: true,
});

const proxyServer = serve({ fetch: app.fetch, port: PORT }, (info) => {
	console.log(`[streams] Proxy running on http://localhost:${info.port}`);
});

const agentServer = serve(
	{ fetch: claudeAgentApp.fetch, port: AGENT_PORT },
	(info) => {
		console.log(
			`[streams] Claude agent endpoint on http://localhost:${info.port}`,
		);
	},
);

process.on("SIGINT", async () => {
	proxyServer.close();
	agentServer.close();
	await durableStreamServer.stop();
	process.exit(0);
});
