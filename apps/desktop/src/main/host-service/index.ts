/**
 * Workspace Service — Desktop Entry Point
 *
 * Starts the host-service HTTP server on a port assigned by the coordinator.
 * The coordinator polls health.check to know when it's ready.
 */

import { serve } from "@hono/node-server";
import {
	createApp,
	JwtApiAuthProvider,
	LocalGitCredentialProvider,
	LocalModelProvider,
	PskHostAuthProvider,
} from "@superset/host-service";
import {
	initTerminalBaseEnv,
	resolveTerminalBaseEnv,
} from "@superset/host-service/terminal-env";
import { connectRelay } from "@superset/host-service/tunnel";
import { removeManifest, writeManifest } from "main/lib/host-service-manifest";
import { env } from "./env";

async function main(): Promise<void> {
	const terminalBaseEnv = await resolveTerminalBaseEnv();
	initTerminalBaseEnv(terminalBaseEnv);

	const authProvider = new JwtApiAuthProvider(
		env.AUTH_TOKEN,
		env.CLOUD_API_URL,
	);

	const { app, injectWebSocket, api } = createApp({
		config: {
			organizationId: env.ORGANIZATION_ID,
			dbPath: env.HOST_DB_PATH,
			cloudApiUrl: env.CLOUD_API_URL,
			migrationsFolder: env.HOST_MIGRATIONS_FOLDER,
			allowedOrigins: [
				`http://localhost:${env.DESKTOP_VITE_PORT}`,
				`http://127.0.0.1:${env.DESKTOP_VITE_PORT}`,
			],
		},
		providers: {
			auth: authProvider,
			hostAuth: new PskHostAuthProvider(env.HOST_SERVICE_SECRET),
			credentials: new LocalGitCredentialProvider(),
			modelResolver: new LocalModelProvider(),
		},
	});

	const startedAt = Date.now();
	const server = serve(
		{ fetch: app.fetch, port: env.HOST_SERVICE_PORT, hostname: "127.0.0.1" },
		(info: { port: number }) => {
			if (env.ORGANIZATION_ID) {
				try {
					writeManifest({
						pid: process.pid,
						endpoint: `http://127.0.0.1:${info.port}`,
						authToken: env.HOST_SERVICE_SECRET,
						startedAt,
						organizationId: env.ORGANIZATION_ID,
					});
				} catch (error) {
					console.error("[host-service] Failed to write manifest:", error);
				}
			}

			if (env.RELAY_URL && env.ORGANIZATION_ID) {
				void connectRelay({
					api,
					relayUrl: env.RELAY_URL,
					localPort: info.port,
					organizationId: env.ORGANIZATION_ID,
					authProvider,
					hostServiceSecret: env.HOST_SERVICE_SECRET,
				});
			}
		},
	);
	injectWebSocket(server);

	const shutdown = () => {
		if (env.ORGANIZATION_ID) {
			removeManifest(env.ORGANIZATION_ID);
		}
		server.close();
		process.exit(0);
	};

	process.on("SIGTERM", shutdown);
	process.on("SIGINT", shutdown);
}

void main().catch((error) => {
	console.error("[host-service] Failed to start:", error);
	process.exit(1);
});
