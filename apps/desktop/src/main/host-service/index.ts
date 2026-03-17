/**
 * Workspace Service — Desktop Entry Point
 *
 * Run with: ELECTRON_RUN_AS_NODE=1 electron dist/main/host-service.js
 *
 * Starts the host-service HTTP server on a random local port.
 * The parent Electron process reads the port from stdout.
 */

import { serve } from "@hono/node-server";
import {
	createApp,
	JwtAuthProvider,
	LocalCredentialProvider,
} from "@superset/host-service";

const authToken = process.env.AUTH_TOKEN;
const cloudApiUrl = process.env.CLOUD_API_URL;
const dbPath = process.env.HOST_DB_PATH;
const deviceClientId = process.env.DEVICE_CLIENT_ID;
const deviceName = process.env.DEVICE_NAME;

const auth =
	authToken && cloudApiUrl ? new JwtAuthProvider(authToken) : undefined;

const { app, injectWebSocket } = createApp({
	credentials: new LocalCredentialProvider(),
	auth,
	cloudApiUrl,
	dbPath,
	deviceClientId,
	deviceName,
});

const server = serve(
	{ fetch: app.fetch, port: 0, hostname: "127.0.0.1" },
	(info: { port: number }) => {
		process.stdout.write(`${JSON.stringify({ port: info.port })}\n`);
	},
);
injectWebSocket(server);

const shutdown = () => {
	server.close();
	process.exit(0);
};

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

// Orphan cleanup: exit if parent Electron process dies
const parentPid = process.ppid;
const parentCheck = setInterval(() => {
	try {
		process.kill(parentPid, 0);
	} catch {
		clearInterval(parentCheck);
		console.log("[host-service] Parent process exited, shutting down");
		shutdown();
	}
}, 2000);
parentCheck.unref();
