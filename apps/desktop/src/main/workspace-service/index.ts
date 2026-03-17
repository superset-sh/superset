/**
 * Workspace Service — Desktop Entry Point
 *
 * Run with: ELECTRON_RUN_AS_NODE=1 electron dist/main/workspace-service.js
 *
 * Starts the workspace-service HTTP server on a random local port.
 * The parent Electron process reads the port from stdout.
 */

import { serve } from "@hono/node-server";
import app from "@superset/workspace-service";

const server = serve(
	{ fetch: app.fetch, port: 0, hostname: "127.0.0.1" },
	(info: { port: number }) => {
		process.stdout.write(`${JSON.stringify({ port: info.port })}\n`);
	},
);

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
		console.log("[workspace-service] Parent process exited, shutting down");
		shutdown();
	}
}, 2000);
parentCheck.unref();
