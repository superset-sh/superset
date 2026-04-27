/**
 * Workspace Service — Desktop Entry Point
 *
 * Starts the host-service HTTP server on a port assigned by the coordinator.
 * The coordinator polls health.check to know when it's ready.
 */

import { serve } from "@hono/node-server";
import {
	createApp,
	installHostServiceProcessGuards,
	JwtApiAuthProvider,
	LocalGitCredentialProvider,
	LocalModelProvider,
	PskHostAuthProvider,
	reportHostServiceError,
	runHostServiceBackgroundTask,
} from "@superset/host-service";
import {
	initTerminalBaseEnv,
	resolveTerminalBaseEnv,
} from "@superset/host-service/terminal-env";
import { connectRelay } from "@superset/host-service/tunnel";
import { writeManifest } from "main/lib/host-service-manifest";

const STARTUP_RETRY_DELAY_MS = 5_000;

async function main(): Promise<void> {
	const { env } = await import("./env");
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
				const relayUrl = env.RELAY_URL;
				runHostServiceBackgroundTask("relay startup failed", () =>
					connectRelay({
						api,
						relayUrl,
						localPort: info.port,
						organizationId: env.ORGANIZATION_ID,
						authProvider,
						hostServiceSecret: env.HOST_SERVICE_SECRET,
					}),
				);
			}
		},
	);
	server.on("error", (error) => {
		reportHostServiceError("server error", error);
	});
	try {
		injectWebSocket(server);
	} catch (error) {
		reportHostServiceError("websocket injection failed", error);
	}

	// Manifest lifecycle belongs to the coordinator, not the child.
	const shutdown = () => {
		try {
			server.close();
		} catch (error) {
			reportHostServiceError("server close failed", error);
		}
		process.exit(0);
	};

	process.on("SIGTERM", shutdown);
	process.on("SIGINT", shutdown);
}

installHostServiceProcessGuards();

function startWithRetry(): void {
	void main().catch((error) => {
		reportHostServiceError("failed to start", error);
		setTimeout(startWithRetry, STARTUP_RETRY_DELAY_MS);
	});
}

startWithRetry();
