import { serve } from "@hono/node-server";
import { createApp } from "./app";
import { env } from "./env";
import { PskHostAuthProvider } from "./providers/host-auth";

const hostAuth = new PskHostAuthProvider(env.HOST_SERVICE_SECRET);
const { app, injectWebSocket } = createApp({
	dbPath: env.HOST_DB_PATH,
	hostAuth,
	allowedOrigins: env.CORS_ORIGINS ?? [],
});

const server = serve({ fetch: app.fetch, port: env.PORT }, (info) => {
	console.log(`[host-service] listening on http://localhost:${info.port}`);
});
injectWebSocket(server);
