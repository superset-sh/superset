import { existsSync, mkdirSync } from "node:fs";
import { DurableStreamTestServer } from "@durable-streams/server";
import { serve } from "@hono/node-server";
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

const internalUrl =
	env.STREAMS_INTERNAL_URL ?? `http://localhost:${env.STREAMS_INTERNAL_PORT}`;

const corsOrigins = env.CORS_ORIGINS
	? env.CORS_ORIGINS.split(",").map((o) => o.trim())
	: undefined;

const { app } = createServer({
	baseUrl: internalUrl,
	cors: true,
	corsOrigins,
	logging: true,
});

const proxyServer = serve(
	{ fetch: app.fetch, port: env.STREAMS_PORT },
	(info) => {
		console.log(`[streams] Proxy running on http://localhost:${info.port}`);
	},
);

for (const signal of ["SIGINT", "SIGTERM"]) {
	process.on(signal, async () => {
		proxyServer.close();
		await durableStreamServer.stop();
		process.exit(0);
	});
}
