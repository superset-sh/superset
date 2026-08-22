/**
 * Workspace Service — Desktop Entry Point
 *
 * Starts the host-service HTTP server on a port assigned by the coordinator.
 * The coordinator polls health.check to know when it's ready.
 */

import { serve } from "@hono/node-server";
import {
	captureFatalStartupError,
	createApp,
	initSentry,
	installProcessSafetyNet,
	installUpgradeSocketGuard,
	JwtApiAuthProvider,
	LocalGitCredentialProvider,
	PskHostAuthProvider,
	resolveBrowserBridgeFromEnv,
	startTerminalReaper,
} from "@superset/host-service";
import {
	initTerminalBaseEnv,
	resolveTerminalBaseEnv,
} from "@superset/host-service/terminal-env";
import { connectRelay } from "@superset/host-service/tunnel";
import { loadToken } from "lib/trpc/routers/auth/utils/auth-functions";
import {
	type HostServiceManifest,
	isProcessAlive,
	readManifest,
	shouldYieldManifest,
	writeManifest,
} from "main/lib/host-service-manifest";
import { pollHealthCheck } from "main/lib/host-service-utils";
import { env } from "./env";

const SHUTDOWN_GRACE_MS = 3_000;
const WATCHDOG_INTERVAL_MS = 2_000;
const MANIFEST_RECLAIM_INTERVAL_MS = 15_000;

type Server = ReturnType<typeof serve>;

async function main(): Promise<void> {
	initSentry({ organizationId: env.ORGANIZATION_ID });

	// Install the parent watchdog before any awaits so a crash during
	// startup can still reap this child. `serverRef` is filled in once
	// serve() returns; shutdown handles both pre- and post-bind states.
	const serverRef: { current: Server | null } = { current: null };
	let shuttingDown = false;
	let manifestReclaimTimer: NodeJS.Timeout | null = null;
	const shutdown = (reason: string) => {
		if (shuttingDown) return;
		shuttingDown = true;
		// A reclaim tick during the drain window would resurrect the manifest
		// the coordinator just removed, leaving it naming a dead pid.
		if (manifestReclaimTimer) clearInterval(manifestReclaimTimer);
		console.log(`[host-service] shutdown (${reason}), draining connections`);
		const server = serverRef.current;
		if (!server) {
			process.exit(0);
		}
		server.close();
		// SSE/WS streams (chat, watchers) ignore server.close() — give in-flight
		// HTTP a brief window, then forcibly tear sockets down.
		const forceExit = setTimeout(() => {
			const httpServer = server as unknown as {
				closeAllConnections?: () => void;
			};
			httpServer.closeAllConnections?.();
			process.exit(0);
		}, SHUTDOWN_GRACE_MS);
		forceExit.unref();
	};

	process.on("SIGTERM", () => shutdown("SIGTERM"));
	process.on("SIGINT", () => shutdown("SIGINT"));

	// Self-exit if our Electron parent dies without sending SIGTERM
	// (orphan reparenting to init/launchd). CLI-spawned host-services
	// don't set HOST_PARENT_PID and skip this.
	const parentPid = Number(process.env.HOST_PARENT_PID);
	if (Number.isInteger(parentPid) && parentPid > 1) {
		const interval = setInterval(() => {
			if (!isParentAlive(parentPid)) {
				clearInterval(interval);
				shutdown("parent-exit");
			}
		}, WATCHDOG_INTERVAL_MS);
		interval.unref();
	}

	const terminalBaseEnv = await resolveTerminalBaseEnv();
	initTerminalBaseEnv(terminalBaseEnv);

	const authProvider = new JwtApiAuthProvider({
		// Read fresh from disk every time we need to mint a new JWT, so that
		// re-logins in the desktop renderer (which rewrites auth-token.enc)
		// are picked up without restarting the host-service child. Falls back
		// to the boot-time token if the file is missing for any reason.
		getSessionToken: async () => {
			const { token } = await loadToken();
			return token ?? env.AUTH_TOKEN;
		},
		apiUrl: env.SUPERSET_API_URL,
	});

	const { app, injectWebSocket, api, db } = createApp({
		config: {
			organizationId: env.ORGANIZATION_ID,
			dbPath: env.HOST_DB_PATH,
			cloudApiUrl: env.SUPERSET_API_URL,
			migrationsFolder: env.HOST_MIGRATIONS_FOLDER,
			allowedOrigins: [
				`http://localhost:${env.DESKTOP_VITE_PORT}`,
				`http://127.0.0.1:${env.DESKTOP_VITE_PORT}`,
			],
			browserBridge: resolveBrowserBridgeFromEnv(env),
		},
		providers: {
			auth: authProvider,
			hostAuth: new PskHostAuthProvider(env.HOST_SERVICE_SECRET),
			credentials: new LocalGitCredentialProvider(),
		},
	});

	const startedAt = Date.now();
	const server = serve(
		{ fetch: app.fetch, port: env.HOST_SERVICE_PORT, hostname: "127.0.0.1" },
		(info: { port: number }) => {
			// Install only after the server is listening so startup throws still
			// reach `main().catch(...)` and exit with a non-zero code.
			installProcessSafetyNet();

			// Orphan reaping + port detection for terminals no renderer has attached.
			startTerminalReaper(db);

			if (env.ORGANIZATION_ID) {
				const manifest: HostServiceManifest = {
					pid: process.pid,
					endpoint: `http://127.0.0.1:${info.port}`,
					authToken: env.HOST_SERVICE_SECRET,
					startedAt,
					organizationId: env.ORGANIZATION_ID,
				};
				void claimManifest(manifest).catch((error) => {
					console.error("[host-service] Failed to write manifest:", error);
				});
				// Yielding at boot must not be permanent: when the holder later
				// quits (removing its manifest) or dies, re-claim so the CLI's
				// routing table always names a live instance.
				manifestReclaimTimer = setInterval(() => {
					if (readManifest(manifest.organizationId)?.pid === process.pid) {
						return;
					}
					void claimManifest(manifest).catch(() => {});
				}, MANIFEST_RECLAIM_INTERVAL_MS);
				manifestReclaimTimer.unref();
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
	serverRef.current = server;
	installUpgradeSocketGuard(server);
	injectWebSocket(server);
}

function isParentAlive(parentPid: number): boolean {
	try {
		process.kill(parentPid, 0);
		return process.ppid === parentPid;
	} catch {
		return false;
	}
}

// Same retrying probe the coordinator's adopt decision uses — a holder that
// is momentarily slow (mid-GC, DB migration) must not get its claim taken.
const MANIFEST_HOLDER_PROBE_TIMEOUT_MS = 2_500;

async function claimManifest(manifest: HostServiceManifest): Promise<void> {
	const existing = readManifest(manifest.organizationId);
	const yieldToHolder = await shouldYieldManifest(existing, process.pid, {
		isAlive: isProcessAlive,
		probeHealthy: (endpoint, authToken) =>
			pollHealthCheck(endpoint, authToken, MANIFEST_HOLDER_PROBE_TIMEOUT_MS),
	});
	if (yieldToHolder) {
		console.warn(
			`[host-service] manifest for ${manifest.organizationId} held by live pid ${existing?.pid} at ${existing?.endpoint}; not claiming`,
		);
		return;
	}
	writeManifest(manifest);
}

void main().catch(async (error) => {
	console.error("[host-service] Failed to start:", error);
	await captureFatalStartupError(error);
	process.exit(1);
});
