import { createNodeWebSocket } from "@hono/node-ws";
import { trpcServer } from "@hono/trpc-server";
import { Octokit } from "@octokit/rest";
import { ChatService } from "@superset/chat/server/desktop";
import { eq } from "drizzle-orm";
import type { MiddlewareHandler } from "hono";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { createApiClient } from "./api";
import { createDb, type HostDb } from "./db";
import { workspaces } from "./db/schema";
import { EventBus, GitWatcher, registerEventBusRoute } from "./events";
import type { ApiAuthProvider } from "./providers/auth";
import type { HostAuthProvider } from "./providers/host-auth";
import type { ModelProviderRuntimeResolver } from "./providers/model-providers";
import {
	AcpSessionManager,
	registerAcpSessionStreamRoute,
	SqliteAcpSessionPersistence,
} from "./runtime/acp-sessions";
import { ChatRuntimeManager } from "./runtime/chat";
import { WorkspaceFilesystemManager } from "./runtime/filesystem";
import type { GitCredentialProvider } from "./runtime/git";
import { createGitFactory } from "./runtime/git";
import { runMainWorkspaceSweep } from "./runtime/main-workspace-sweep";
import { PullRequestRuntimeManager } from "./runtime/pull-requests";
import { runWorkspaceBackfill } from "./runtime/workspace-backfill";
import { startWorkspaceCloudSync } from "./runtime/workspace-cloud-sync";
import { registerWorkspaceTerminalRoute } from "./terminal/terminal";
import {
	SqliteTerminalAgentBindingPersistence,
	TerminalAgentStore,
} from "./terminal-agents";
import { appRouter } from "./trpc/router";
import {
	execGh as defaultExecGh,
	type ExecGh,
} from "./trpc/router/workspace-creation/utils/exec-gh";
import type { ApiClient } from "./types";

export interface CreateAppOptions {
	config: {
		organizationId: string;
		dbPath: string;
		cloudApiUrl: string;
		migrationsFolder: string;
		allowedOrigins: string[];
	};
	providers: {
		auth: ApiAuthProvider;
		hostAuth: HostAuthProvider;
		credentials: GitCredentialProvider;
		modelResolver: ModelProviderRuntimeResolver;
	};
	/**
	 * Test-harness override hooks. Production never sets these — `createApp`
	 * builds each subsystem itself when omitted. `db` is overridden so tests
	 * can swap in `bun:sqlite` (better-sqlite3 isn't loadable under Bun;
	 * prod uses it on bundled Node). `api`, `github`, `chatRuntime`, and
	 * `chatService` are overridden to keep tests off the network and out of
	 * mastra storage.
	 */
	db?: HostDb;
	api?: ApiClient;
	github?: () => Promise<Octokit>;
	execGh?: ExecGh;
	chatRuntime?: ChatRuntimeManager;
	chatService?: ChatService;
	acpSessions?: AcpSessionManager;
}

export interface CreateAppResult {
	app: Hono;
	injectWebSocket: ReturnType<typeof createNodeWebSocket>["injectWebSocket"];
	api: ApiClient;
	db: HostDb;
	dispose: () => Promise<void>;
}

export function createApp(options: CreateAppOptions): CreateAppResult {
	const { config, providers } = options;

	const api =
		options.api ??
		createApiClient(config.cloudApiUrl, providers.auth, config.organizationId);
	const db = options.db ?? createDb(config.dbPath, config.migrationsFolder);
	const git = createGitFactory(providers.credentials);
	const github =
		options.github ??
		(async () => {
			const token = await providers.credentials.getToken("github.com");
			if (!token) {
				throw new Error(
					"No GitHub token available. Set GITHUB_TOKEN/GH_TOKEN or authenticate via git credential manager.",
				);
			}
			return new Octokit({ auth: token });
		});
	const execGh: ExecGh = options.execGh ?? defaultExecGh;

	const filesystem = new WorkspaceFilesystemManager({ db });
	// GitWatcher is the single source of truth for `.git/` and worktree fs
	// activity per workspace. Both EventBus (broadcasts to clients) and the
	// pull-requests runtime (event-driven branch sync) subscribe to it.
	const gitWatcher = new GitWatcher(db, filesystem);
	gitWatcher.start();
	const pullRequestRuntime = new PullRequestRuntimeManager({
		db,
		execGh,
		git,
		github,
		gitWatcher,
	});
	pullRequestRuntime.start();
	const chatRuntime =
		options.chatRuntime ??
		new ChatRuntimeManager({
			db,
			runtimeResolver: providers.modelResolver,
		});
	// Provider auth (Anthropic / OpenAI OAuth + API keys) is per-machine, not
	// per-workspace. ChatService is a long-lived singleton wrapping mastra's
	// auth storage; the `host.auth.*` router proxies to it.
	const chatService = options.chatService ?? new ChatService();
	// ACP session harness (docs/acp-sessions.md) — owns Claude Code
	// adapter child processes. Fully parallel to the mastra chat runtime.
	// Pre-release, so internal-channel only: the desktop coordinator spawns
	// hosts with SUPERSET_ACP_SESSIONS=1 on canary/dev builds, never on
	// stable. Without it the harness is inert — no WS route, every RPC except
	// the `list` capability probe rejected. Tests that inject a manager opt
	// in implicitly.
	const acpSessionsEnabled =
		options.acpSessions !== undefined ||
		process.env.SUPERSET_ACP_SESSIONS === "1";
	const acpSessions =
		options.acpSessions ??
		new AcpSessionManager({
			resolveWorkspaceCwd: (workspaceId) => {
				const workspace = db.query.workspaces
					.findFirst({ where: eq(workspaces.id, workspaceId) })
					.sync();
				if (!workspace) {
					throw new Error(`Workspace not found: ${workspaceId}`);
				}
				return workspace.worktreePath;
			},
			// Registry rows only (workspace binding, adapter session id, title)
			// — the journal stays in-memory; a restarted host lists these as
			// `offline` and resurrects on demand via the adapter's session/load.
			persistence: new SqliteAcpSessionPersistence(db),
		});

	const runtime = {
		acpSessions,
		acpSessionsEnabled,
		auth: chatService,
		chat: chatRuntime,
		filesystem,
		pullRequests: pullRequestRuntime,
	};
	const app = new Hono();
	const { injectWebSocket, upgradeWebSocket } = createNodeWebSocket({ app });

	app.use(
		"*",
		cors({
			origin: config.allowedOrigins,
			allowHeaders: [
				"Content-Type",
				"Authorization",
				"trpc-accept",
				"x-superset-client-machine-id",
			],
		}),
	);

	const eventBus = new EventBus({ db, filesystem, gitWatcher });
	eventBus.start();

	const terminalAgentPersistence = new SqliteTerminalAgentBindingPersistence(
		db,
	);
	// Hygiene only — reads hide defunct bindings via the session-liveness
	// join regardless, so a failure here must not block startup.
	try {
		terminalAgentPersistence.deleteDefunct();
	} catch (error) {
		console.warn(
			"[terminal-agents] failed to prune defunct binding rows",
			error,
		);
	}
	const terminalAgentStore = new TerminalAgentStore(terminalAgentPersistence);

	// Startup sweeps + the dual-write reconciler run in the background so
	// they don't block server startup. Ordering matters: the backfill fills
	// cloud-only fields on pre-existing rows before the main-workspace sweep
	// or reconciler touch them (the reconciler skips unbackfilled rows).
	let workspaceCloudSync: ReturnType<typeof startWorkspaceCloudSync> | null =
		null;
	void (async () => {
		await runWorkspaceBackfill({
			api,
			db,
			eventBus,
			organizationId: config.organizationId,
		}).catch((err) => {
			console.warn("[host-service] workspace backfill failed:", err);
		});
		// Backfill `kind='main'` workspaces for projects already set up before
		// this column shipped. Idempotent — only does real work the first
		// time after upgrade.
		await runMainWorkspaceSweep({
			api,
			db,
			git,
			eventBus,
			organizationId: config.organizationId,
		}).catch((err) => {
			console.warn("[host-service] main-workspace sweep failed:", err);
		});
		workspaceCloudSync = startWorkspaceCloudSync({
			api,
			db,
			eventBus,
			organizationId: config.organizationId,
		});
	})();

	const wsAuth: MiddlewareHandler = async (c, next) => {
		const token = c.req.query("token");
		const authorized =
			(await providers.hostAuth.validate(c.req.raw)) ||
			(token && (await providers.hostAuth.validateToken(token)));
		if (!authorized) return c.json({ error: "Unauthorized" }, 401);
		return next();
	};
	app.use("/terminal/*", wsAuth);
	app.use("/events", wsAuth);
	app.use("/acp-sessions/*", wsAuth);

	registerEventBusRoute({ app, eventBus, upgradeWebSocket });
	registerWorkspaceTerminalRoute({
		app,
		db,
		eventBus,
		upgradeWebSocket,
	});
	if (acpSessionsEnabled) {
		registerAcpSessionStreamRoute({
			app,
			sessions: acpSessions,
			upgradeWebSocket,
		});
	}

	app.use(
		"/trpc/*",
		trpcServer({
			router: appRouter,
			createContext: async (_opts, c) => {
				const isAuthenticated = await providers.hostAuth.validate(c.req.raw);
				return {
					git,
					credentials: providers.credentials,
					github,
					execGh,
					api,
					db,
					runtime,
					eventBus,
					terminalAgentStore,
					organizationId: config.organizationId,
					isAuthenticated,
					clientMachineId:
						c.req.header("x-superset-client-machine-id") ?? undefined,
				} as Record<string, unknown>;
			},
		}),
	);

	const ownsDb = options.db === undefined;
	const dispose = async (): Promise<void> => {
		// Each step is best-effort and isolated: a throw in one cleanup must
		// not skip the others, otherwise a flaky `.stop()` could leak the
		// open SQLite handle for the rest of the process lifetime.
		try {
			workspaceCloudSync?.stop();
		} catch (err) {
			console.warn("[host-service] workspaceCloudSync.stop failed:", err);
		}
		try {
			pullRequestRuntime.stop();
		} catch (err) {
			console.warn("[host-service] pullRequestRuntime.stop failed:", err);
		}
		try {
			await acpSessions.dispose();
		} catch (err) {
			console.warn("[host-service] acpSessions.dispose failed:", err);
		}
		try {
			eventBus.close();
		} catch (err) {
			console.warn("[host-service] eventBus.close failed:", err);
		}
		try {
			gitWatcher.close();
		} catch (err) {
			console.warn("[host-service] gitWatcher.close failed:", err);
		}
		if (ownsDb) {
			try {
				(db as unknown as { $client?: { close: () => void } }).$client?.close();
			} catch {
				// best-effort close; tests should not fail on teardown
			}
		}
	};

	return { app, injectWebSocket, api, db, dispose };
}
