/**
 * Workspace Service — Desktop Entry Point
 *
 * Run with: ELECTRON_RUN_AS_NODE=1 electron dist/main/host-service.js
 *
 * Starts the host-service HTTP server on a random local port.
 * The parent Electron process reads the port from the IPC channel.
 *
 * When KEEP_ALIVE_AFTER_PARENT=1, the service stays running even if the
 * parent Electron process exits (out-of-app durability mode).
 */

import { serve } from "@hono/node-server";
import {
	createApp,
	JwtApiAuthProvider,
	LocalGitCredentialProvider,
	PskHostAuthProvider,
} from "@superset/host-service";
import {
	initTerminalBaseEnv,
	resolveTerminalBaseEnv,
} from "@superset/host-service/terminal-env";
import {
	HOST_SERVICE_PROTOCOL_VERSION,
	removeManifest,
	writeManifest,
} from "main/lib/host-service-manifest";

async function main(): Promise<void> {
	const terminalBaseEnv = await resolveTerminalBaseEnv();
	initTerminalBaseEnv(terminalBaseEnv);

	const authToken = process.env.AUTH_TOKEN;
	const cloudApiUrl = process.env.CLOUD_API_URL;
	const dbPath = process.env.HOST_DB_PATH;
	const deviceClientId = process.env.DEVICE_CLIENT_ID;
	const deviceName = process.env.DEVICE_NAME;
	const hostServiceSecret = process.env.HOST_SERVICE_SECRET;
	const serviceVersion = process.env.HOST_SERVICE_VERSION ?? null;
	const protocolVersion = HOST_SERVICE_PROTOCOL_VERSION;
	const organizationId = process.env.ORGANIZATION_ID ?? "";
	const desktopVitePort = process.env.DESKTOP_VITE_PORT ?? "5173";
	const keepAliveAfterParent = process.env.KEEP_ALIVE_AFTER_PARENT === "1";

	const auth =
		authToken && cloudApiUrl ? new JwtApiAuthProvider(authToken) : undefined;
	const hostAuth = hostServiceSecret
		? new PskHostAuthProvider(hostServiceSecret)
		: undefined;

	const { app, injectWebSocket } = createApp({
		credentials: new LocalGitCredentialProvider(),
		auth,
		hostAuth,
		cloudApiUrl,
		dbPath,
		deviceClientId,
		deviceName,
		serviceVersion,
		protocolVersion,
		allowedOrigins: [
			`http://localhost:${desktopVitePort}`,
			`http://127.0.0.1:${desktopVitePort}`,
		],
	});

	const startedAt = Date.now();
	const server = serve(
		{ fetch: app.fetch, port: 0, hostname: "127.0.0.1" },
		(info: { port: number }) => {
			if (organizationId) {
				try {
					writeManifest({
						pid: process.pid,
						endpoint: `http://127.0.0.1:${info.port}`,
						authToken: hostServiceSecret ?? "",
						serviceVersion: serviceVersion ?? "",
						protocolVersion: protocolVersion ?? 0,
						startedAt,
						organizationId,
					});
				} catch (error) {
					console.error("[host-service] Failed to write manifest:", error);
				}
			}
			process.send?.({
				type: "ready",
				port: info.port,
				serviceVersion,
				protocolVersion,
				startedAt,
			});
		},
	);
	injectWebSocket(server);

	const shutdown = () => {
		if (organizationId) {
			removeManifest(organizationId);
		}
		server.close();
		process.exit(0);
	};

	process.on("SIGTERM", shutdown);
	process.on("SIGINT", shutdown);

	if (!keepAliveAfterParent) {
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
	}
}

void main().catch((error) => {
	console.error("[host-service] Failed to start:", error);
	process.exit(1);
});
