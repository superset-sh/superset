import { DurableStreamTestServer } from "@durable-streams/server";
import { serve } from "@hono/node-server";
import { createServer } from "./server";

const PORT = parseInt(process.env.PORT ?? "8080", 10);
const INTERNAL_PORT = parseInt(process.env.INTERNAL_PORT ?? "8081", 10);
const DURABLE_STREAMS_URL =
	process.env.DURABLE_STREAMS_URL ?? `http://127.0.0.1:${INTERNAL_PORT}`;

// Start internal durable stream server
const durableStreamServer = new DurableStreamTestServer({
	port: INTERNAL_PORT,
});
await durableStreamServer.start();
console.log(`[streams] Durable stream server on port ${INTERNAL_PORT}`);

// Start proxy server
const { app } = createServer({
	baseUrl: DURABLE_STREAMS_URL,
	cors: true,
	logging: true,
});

serve({ fetch: app.fetch, port: PORT }, (info) => {
	console.log(`[streams] Proxy running on http://localhost:${info.port}`);
});

// Graceful shutdown
process.on("SIGINT", async () => {
	await durableStreamServer.stop();
	process.exit(0);
});
