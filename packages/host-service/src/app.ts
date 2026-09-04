import { createNodeWebSocket } from "@hono/node-ws";
import { trpcServer } from "@hono/trpc-server";
import { Octokit } from "@octokit/rest";
import { ChatService } from "@superset/provider-auth/server";
import { SUPERSET_USER_ID_HEADER } from "@superset/shared/host-routing";
import { TRPCError } from "@trpc/server";
import type { MiddlewareHandler } from "hono";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { createApiClient } from "./api";
import { createChatV3Mount, registerChatV3Routes } from "./chat-v3";
import { createDb, type HostDb } from "./db";
import { EventBus, GitWatcher, registerEventBusRoute } from "./events";
import { agentIsBusy, PageWatchManager } from "./page-watch/index.ts";
import { registerForwardMuxRoute } from "./ports/forward-mux-route";
import { portManager } from "./ports/port-manager";
import type { ApiAuthProvider } from "./providers/auth";
import type { HostAuthProvider } from "./providers/host-auth";
import { runArchivedWorkspaceReconcile } from "./runtime/archived-workspace-reconcile";
import { registerBrowserCdpRoute } from "./runtime/browser-bridge/browser-cdp-route";
import { registerDesktopRoute } from "./runtime/desktop";
import { WorkspaceFilesystemManager } from "./runtime/filesystem";
import type { GitCredentialProvider } from "./runtime/git";
import { createGitEnvResolver, createGitFactory } from "./runtime/git";
import { runMainWorkspaceSweep } from "./runtime/main-workspace-sweep";
import { runProjectBackfill } from "./runtime/project-backfill";
import { PullRequestRuntimeManager } from "./runtime/pull-requests";
import {
	launchSandboxAgentOnce,
	readSandboxIdentity,
	runSandboxSelfSeed,
} from "./runtime/sandbox-self-seed";
import {
	isLiveTerminalSession,
	registerWorkspaceTerminalRoute,
	writeFramedInputToSession,
} from "./terminal/terminal";
import {
	SqliteTerminalAgentBindingPersistence,
	TerminalAgentStore,
} from "./terminal-agents";
import { appRouter } from "./trpc/router";
import { provisionSelectedAccounts } from "./trpc/router/usage/account-provisioning";
import {
	execGh as defaultExecGh,
	type ExecGh,
} from "./trpc/router/workspace-creation/utils/exec-gh";
import type {
	ApiClient,
	BrowserBridgeConfig,
	HostServiceContext,
} from "./types";
import { getHostWorkerPool } from "./workers/host-worker-pool";
import { gitWorkspaceRefsTask } from "./workers/tasks/git";

export interface CreateAppOptions {
	config: {
		organizationId: string;
		dbPath: string;
		cloudApiUrl: string;
		migrationsFolder: string;
		allowedOrigins: string[];
		/** Loopback surface for driving desktop browser panes; desktop-only. */
		browserBridge?: BrowserBridgeConfig;
	};
	providers: {
		auth: ApiAuthProvider;
		hostAuth: HostAuthProvider;
		credentials: GitCredentialProvider;
	};
	/**
	 * Test-harness override hooks. Production never sets these — `createApp`
	 * builds each subsystem itself when omitted. `db` is overridden so tests
	 * can swap in `bun:sqlite` (better-sqlite3 isn't loadable under Bun;
	 * prod uses it on bundled Node). `api`, `github`, and `chatService` are
	 * overridden to keep tests off the network and out of provider-auth storage.
	 */
	db?: HostDb;
	api?: ApiClient;
	github?: () => Promise<Octokit>;
	execGh?: ExecGh;
	chatService?: ChatService;
}

export interface CreateAppResult {
	app: Hono;
	injectWebSocket: ReturnType<typeof createNodeWebSocket>["injectWebSocket"];
	api: ApiClient;
	db: HostDb;
	eventBus: EventBus;
	/**
	 * In a sandbox, runs the agent the workspace was created with. Call once
	 * the server is listening; a no-op everywhere else and on every boot after
	 * the first.
	 */
	launchSandboxAgent: () => Promise<void>;
	dispose: () => Promise<void>;
}

export function createApp(options: CreateAppOptions): CreateAppResult {
	const { config, providers } = options;

	const api =
		options.api ??
		createApiClient(config.cloudApiUrl, providers.auth, config.organizationId);
	const db = options.db ?? createDb(config.dbPath, config.migrationsFolder);
	// A sandbox is provisioned for exactly one workspace, and the env says
	// which. Seeding it here rather than from the API keeps the schema in one
	// place and leaves provisioning with nothing to orchestrate.
	const sandboxIdentity = readSandboxIdentity();
	if (sandboxIdentity) runSandboxSelfSeed(db, sandboxIdentity);
	const git = createGitFactory(providers.credentials);
	const github =
		options.github ??
		(async () => {
			const token = await providers.credentials.getToken("github.com");
			if (!token) {
				// Expected precondition failure (user has no GitHub auth), not an
				// internal error — every procedure calling ctx.github() inherits
				// this classification.
				throw new TRPCError({
					code: "PRECONDITION_FAILED",
					message: providers.credentials.credentialRemedy(
						"github.com",
						"missing",
					),
					cause: { kind: "NO_GITHUB_TOKEN" },
				});
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
	// Per-workspace branch/HEAD/upstream reads run in the worker pool: the
	// PR-sync loop fires them for every workspace on each watcher event and
	// 5-min sweep, which would otherwise spawn+drain git on the event loop.
	const resolveGitEnv = createGitEnvResolver(providers.credentials);
	const pullRequestRuntime = new PullRequestRuntimeManager({
		db,
		execGh,
		git,
		github,
		gitWatcher,
		readWorkspaceRefs: async (worktreePath) => {
			const gitEnv = await resolveGitEnv(worktreePath);
			return getHostWorkerPool().run(
				gitWorkspaceRefsTask,
				{ worktreePath, gitEnv },
				{
					timeoutMs: 15_000,
					strategy: "coalesce",
					dedupeKey: `${worktreePath}:workspace-refs`,
				},
			);
		},
	});
	pullRequestRuntime.start();
	// Provider auth (Anthropic / OpenAI OAuth + API keys) is per-machine, not
	// per-workspace. ChatService is a long-lived singleton wrapping the
	// provider auth storage; the `host.auth.*` router proxies to it.
	const chatService = options.chatService ?? new ChatService();

	// Chat v3 runtime (plans/chat-v3-pane-mount.md). Registered unconditionally:
	// the routes sit behind the same auth as every other host route, and the
	// runtime is built on first request, so chat.db is never created on a host
	// nobody chats with. Exposure is a client concern — the renderer gates the
	// pane on the `chat-v3` PostHog flag.
	const chatV3 = createChatV3Mount({ db, dbPath: config.dbPath });

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
				SUPERSET_USER_ID_HEADER,
			],
		}),
	);

	const eventBus = new EventBus({ db, filesystem, gitWatcher });
	eventBus.start();
	// Post-construction wiring (pullRequestRuntime is built before the
	// EventBus): newly created workspaces get their first branch/upstream sync
	// + PR link immediately instead of waiting for the 5-min safety net.
	pullRequestRuntime.subscribeToWorkspaceEvents(eventBus);

	const terminalAgentPersistence = new SqliteTerminalAgentBindingPersistence(
		db,
	);
	// Hygiene only — reads hide defunct bindings via the session-liveness
	// join regardless, so a failure here must not block startup.
	try {
		terminalAgentPersistence.sweepDefunct();
	} catch (error) {
		console.warn(
			"[terminal-agents] failed to sweep defunct binding rows",
			error,
		);
	}
	const terminalAgentStore = new TerminalAgentStore(terminalAgentPersistence);

	const pageWatch = new PageWatchManager({
		api: {
			listThreads: (pageId) => api.pageComment.list.query({ pageId }),
			setWatch: async (pageId, agentId) => {
				await api.page.setWatch.mutate({ id: pageId, agentId });
			},
			clearWatch: async (pageId) => {
				await api.page.clearWatch.mutate({ id: pageId });
			},
		},
		sendToTerminal: async ({ workspaceId, terminalId, text }) => {
			const result = await writeFramedInputToSession({
				terminalId,
				workspaceId,
				text,
				submit: true,
				db,
				eventBus,
			});
			if ("error" in result) throw new Error(result.error);
		},
		isTerminalAlive: isLiveTerminalSession,
		isAgentBusy: (terminalId) =>
			agentIsBusy(terminalAgentStore.get(terminalId)?.lastEventType),
		hasAgent: (terminalId) => {
			const binding = terminalAgentStore.get(terminalId);
			return binding !== undefined && binding.endedAt === undefined;
		},
	});
	pageWatch.subscribeToTerminalEvents(eventBus);

	const runtime = {
		auth: chatService,
		filesystem,
		pullRequests: pullRequestRuntime,
		pageWatch,
	};

	// Startup sweeps run in the background so they don't block server
	// startup. Ordering matters: the project backfill fills identity fields
	// on pre-existing rows before the main-workspace sweep touches them.
	//
	// None of them run in a sandbox. Every one repairs state a long-lived
	// machine accumulates — rows that predate a column, a delete a previous
	// process crashed out of — and a sandbox is provisioned fresh with exactly
	// one project and one workspace, seeded by us, that no earlier build ever
	// touched. There is nothing to recover, so the sweeps can only invent:
	// the main-workspace sweep already added a phantom second workspace here
	// before bootstrap started seeding `type='main'`.
	void (async () => {
		if (process.env.SUPERSET_HOST_RUN_MODE === "sandbox") return;
		await runProjectBackfill({
			db,
			eventBus,
		}).catch((err) => {
			console.warn("[host-service] project backfill failed:", err);
		});
		// Backfill `kind='main'` workspaces for projects already set up before
		// this column shipped. Idempotent — only does real work the first
		// time after upgrade.
		await runMainWorkspaceSweep({
			db,
			git,
			eventBus,
		}).catch((err) => {
			console.warn("[host-service] main-workspace sweep failed:", err);
		});
		// Finish any delete the previous process crashed out of (archived row
		// whose worktree still exists).
		await runArchivedWorkspaceReconcile({
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
			isAuthenticated: true,
		}).catch((err) => {
			console.warn("[host-service] archived-workspace reconcile failed:", err);
		});
		// Re-share the default account's Claude/Codex config into the selected
		// provider profiles. Last: it touches no host state the sweeps above
		// repair, and a slow filesystem must not delay them.
		await provisionSelectedAccounts(db).catch((err) => {
			console.warn("[host-service] account provisioning failed:", err);
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
	app.use("/chat-v3/*", wsAuth);
	app.use("/browser/*", wsAuth);
	app.use("/desktop/*", wsAuth);
	app.use("/fwd", wsAuth);

	registerEventBusRoute({ app, eventBus, upgradeWebSocket });
	registerBrowserCdpRoute({
		app,
		upgradeWebSocket,
		getBridge: () => config.browserBridge,
	});
	registerDesktopRoute({ app, upgradeWebSocket });
	registerForwardMuxRoute({
		app,
		upgradeWebSocket,
		getPortsByWorkspace: (workspaceId) =>
			portManager.getPortsByWorkspace(workspaceId),
	});
	registerWorkspaceTerminalRoute({
		app,
		db,
		eventBus,
		upgradeWebSocket,
	});
	registerChatV3Routes({ app, db, mount: chatV3, upgradeWebSocket });

	app.use(
		"/trpc/*",
		trpcServer({
			router: appRouter,
			// Renderer clients send every request (including queries) as POST —
			// see createHostServiceLinks in @superset/workspace-client —
			// so a query with a large input (e.g. git.getDiffBulk's file-path
			// list, or a same-tick batch across many workspaces) doesn't produce
			// a GET URL long enough to blow past the header-size limit. Without
			// this flag trpc's default HTTP-method map rejects those POSTs with
			// METHOD_NOT_SUPPORTED before the query ever runs.
			allowMethodOverride: true,
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
					userId: c.req.header(SUPERSET_USER_ID_HEADER)?.trim() || undefined,
					browserBridge: config.browserBridge,
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
			pullRequestRuntime.stop();
		} catch (err) {
			console.warn("[host-service] pullRequestRuntime.stop failed:", err);
		}
		try {
			pageWatch.stop();
		} catch (err) {
			console.warn("[host-service] pageWatch.stop failed:", err);
		}
		try {
			await chatV3.dispose();
		} catch (err) {
			console.warn("[host-service] chatV3.dispose failed:", err);
		}
		// Retire the host-worker threads (and reap their in-flight git
		// children) here rather than leaving them to process.exit(): exit joins
		// every Worker, and a worker wedged in native code hangs that join
		// forever. The desktop entry point bounds this dispose with a deadline
		// and hard-exits past it.
		try {
			await getHostWorkerPool().dispose();
		} catch (err) {
			console.warn("[host-service] hostWorkerPool.dispose failed:", err);
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

	const launchSandboxAgent = async () => {
		if (!sandboxIdentity?.launch) return;
		await launchSandboxAgentOnce(
			{
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
				isAuthenticated: true,
				browserBridge: config.browserBridge,
			} as HostServiceContext,
			sandboxIdentity,
		);
	};

	return {
		app,
		injectWebSocket,
		api,
		db,
		eventBus,
		launchSandboxAgent,
		dispose,
	};
}
