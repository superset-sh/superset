import { existsSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { DurableStreamTestServer } from "@durable-streams/server";
import { serve } from "@hono/node-server";
import { claudeAgentApp } from "./claude-agent";
import { env } from "./env";
import { createServer } from "./server";

const DURABLE_STREAMS_URL =
	env.DURABLE_STREAMS_URL ?? `http://127.0.0.1:${env.INTERNAL_PORT}`;

const DATA_DIR =
	env.DURABLE_STREAMS_DATA_DIR ?? join(homedir(), ".superset", "chat-streams");

if (!existsSync(DATA_DIR)) {
	mkdirSync(DATA_DIR, { recursive: true });
}

const durableStreamServer = new DurableStreamTestServer({
	port: env.INTERNAL_PORT,
	dataDir: DATA_DIR,
});
await durableStreamServer.start();
console.log(`[streams] Durable stream server on port ${env.INTERNAL_PORT}`);

const { app } = createServer({
	baseUrl: DURABLE_STREAMS_URL,
	cors: true,
	logging: true,
	authToken: env.DURABLE_STREAM_AUTH_TOKEN,
});

const proxyServer = serve({ fetch: app.fetch, port: env.PORT }, (info) => {
	console.log(`[streams] Proxy running on http://localhost:${info.port}`);
});

const agentServer = serve(
	{ fetch: claudeAgentApp.fetch, port: env.CLAUDE_AGENT_PORT },
	(info) => {
		console.log(
			`[streams] Claude agent endpoint on http://localhost:${info.port}`,
		);
	},
);

for (const signal of ["SIGINT", "SIGTERM"]) {
	process.on(signal, async () => {
		proxyServer.close();
		agentServer.close();
		await durableStreamServer.stop();
		process.exit(0);
	});
}
