import { serve } from "@hono/node-server";
import { createApp } from "./app";
import { getSupervisor, startDaemonBootstrap } from "./daemon";
import { env } from "./env";
import { installConsoleTimestamps } from "./log-timestamps";
import {
	ConfigFileSessionTokenSource,
	JwtApiAuthProvider,
} from "./providers/auth";
import { LocalGitCredentialProvider } from "./providers/git";
import {
	EdgeGuardedHostAuthProvider,
	PskHostAuthProvider,
} from "./providers/host-auth";
import { provisionAgentIntegrations } from "./runtime/agent-provisioning";
import { resolveBrowserBridgeFromEnv } from "./runtime/browser-bridge/env";
import { applyLoginShellEnvToProcess } from "./runtime/login-shell-env";
import { installProcessSafetyNet, installUpgradeSocketGuard } from "./safety";
import { captureFatalStartupError, initSentry } from "./sentry";
import { startTerminalBaseEnvResolution } from "./terminal/env";
import { startTerminalReaper } from "./terminal/reaper";
import { connectRelay } from "./tunnel";

async function main(): Promise<void> {
	installConsoleTimestamps();
	initSentry({ organizationId: env.ORGANIZATION_ID });
	console.log(
		`[host-service] starting (org=${env.ORGANIZATION_ID}, port=${env.PORT}, NODE_ENV=${process.env.NODE_ENV ?? "unset"})`,
	);

	// Resolve the shell-env snapshot in the background — it must not block the
	// server from listening (the login-shell probe can burn the full 8s
	// budget). PTY creation awaits waitForTerminalBaseEnv() before it reads the
	// snapshot; every other request path is unaffected.
	startTerminalBaseEnvResolution();

	// Standalone entry only: the desktop already merges the login-shell PATH
	// into hosts it spawns. Fire-and-forget for the same reason as the base-env
	// resolution above; git/gh calls racing the probe just see the launcher env
	// once, same as before this merge existed.
	void applyLoginShellEnvToProcess();

	// Fire-and-track: kick off pty-daemon spawn-or-adopt without blocking
	// host-service startup. Terminal request handlers `await
	// waitForDaemonReady(orgId)` before using the supervisor's socket path,
	// so an in-flight bootstrap doesn't race with the first terminal launch.
	// Non-terminal requests (workspaces, git, chat) are unaffected if the
	// daemon takes time to come up or fails entirely.
	startDaemonBootstrap(env.ORGANIZATION_ID);

	// Standalone entry only: the desktop provisions these itself for hosts it
	// spawns (with its per-agent disable settings); this covers CLI/systemd
	// launches, which previously had no notify hooks or shell wrappers (#6254).
	provisionAgentIntegrations();

	const configTokenSource = env.SUPERSET_AUTH_CONFIG_PATH
		? new ConfigFileSessionTokenSource({
				configPath: env.SUPERSET_AUTH_CONFIG_PATH,
				apiUrl: env.SUPERSET_API_URL,
			})
		: null;
	const authProvider = new JwtApiAuthProvider({
		getSessionToken: configTokenSource
			? () => configTokenSource.getSessionToken()
			: async () => env.AUTH_TOKEN,
		onInvalidateCache: configTokenSource
			? () => configTokenSource.invalidateCache()
			: undefined,
		apiUrl: env.SUPERSET_API_URL,
	});

	const { app, injectWebSocket, api, db, launchSandboxAgent } = createApp({
		config: {
			organizationId: env.ORGANIZATION_ID,
			dbPath: env.HOST_DB_PATH,
			cloudApiUrl: env.SUPERSET_API_URL,
			migrationsFolder: env.HOST_MIGRATIONS_FOLDER,
			allowedOrigins: env.CORS_ORIGINS ?? [],
			browserBridge: resolveBrowserBridgeFromEnv(env),
		},
		providers: {
			auth: authProvider,
			hostAuth:
				env.SUPERSET_HOST_RUN_MODE === "sandbox"
					? new EdgeGuardedHostAuthProvider()
					: new PskHostAuthProvider(env.HOST_SERVICE_SECRET),
			credentials: new LocalGitCredentialProvider(),
		},
	});

	// Dev-mode shutdown: kill the daemon on host-service exit so dev
	// iteration on daemon code resets cleanly. Production keeps the
	// daemon detached so PTYs survive host-service restarts.
	// Per the migration plan's D5 decision.
	const isDev = process.env.NODE_ENV === "development";
	if (isDev) {
		let shuttingDown = false;
		const devShutdown = async (signal: NodeJS.Signals) => {
			if (shuttingDown) return;
			shuttingDown = true;
			console.log(
				`[host-service] dev-mode ${signal} — stopping pty-daemon for clean iteration`,
			);
			try {
				await getSupervisor().stop(env.ORGANIZATION_ID);
			} catch (err) {
				console.error(
					"[host-service] dev shutdown: supervisor.stop failed:",
					err,
				);
			} finally {
				process.exit(0);
			}
		};
		process.on("SIGINT", () => void devShutdown("SIGINT"));
		process.on("SIGTERM", () => void devShutdown("SIGTERM"));
	}

	const hostname =
		env.SUPERSET_HOST_RUN_MODE === "sandbox" ? undefined : "127.0.0.1";
	const listen = { fetch: app.fetch, port: env.PORT, hostname };
	const server = serve(listen, (info) => {
		// Install only after the server is listening so startup throws still
		// reach `main().catch(...)` and exit with a non-zero code.
		installProcessSafetyNet();
		const address = info.address.includes(":")
			? `[${info.address}]`
			: info.address;
		console.log(`[host-service] listening on http://${address}:${info.port}`);

		startTerminalReaper(db);
		// A cloud workspace created with an agent starts it now: the pty daemon
		// and event bus are up, and a person opening the workspace sees the
		// agent's terminal the way they would on their own machine.
		void launchSandboxAgent();

		if (env.RELAY_URL && env.SUPERSET_HOST_RUN_MODE !== "sandbox") {
			void connectRelay({
				api,
				relayUrl: env.RELAY_URL,
				localPort: info.port,
				organizationId: env.ORGANIZATION_ID,
				authProvider,
				hostServiceSecret: env.HOST_SERVICE_SECRET,
			});
		}
	});
	installUpgradeSocketGuard(server);
	injectWebSocket(server);
}

void main().catch(async (error) => {
	console.error("[host-service] Failed to start:", error);
	await captureFatalStartupError(error);
	process.exit(1);
});
