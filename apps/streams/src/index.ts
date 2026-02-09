import { existsSync, mkdirSync } from "node:fs";
import { DurableStreamTestServer } from "@durable-streams/server";
import { serve } from "@hono/node-server";
import { claudeAgentApp } from "./claude-agent";
import { env } from "./env";
import { createServer } from "./server";

if (!existsSync(env.STREAMS_DATA_DIR)) {
	mkdirSync(env.STREAMS_DATA_DIR, { recursive: true });
}

const durableStreamServer = new DurableStreamTestServer({
	port: env.STREAMS_INTERNAL_PORT,
	dataDir: env.STREAMS_DATA_DIR,
});
await durableStreamServer.start();
console.log(
	`[streams] Durable stream server on port ${env.STREAMS_INTERNAL_PORT}`,
);

const { app } = createServer({
	baseUrl: env.STREAMS_INTERNAL_URL,
	cors: true,
	logging: true,
	authToken: env.STREAMS_SECRET,
});

const proxyServer = serve({ fetch: app.fetch, port: env.PORT }, (info) => {
	console.log(`[streams] Proxy running on http://localhost:${info.port}`);
});

const agentServer = serve(
	{ fetch: claudeAgentApp.fetch, port: env.STREAMS_AGENT_PORT },
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
