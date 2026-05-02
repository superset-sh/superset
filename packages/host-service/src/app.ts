import { createNodeWebSocket } from "@hono/node-ws";
import { trpcServer } from "@hono/trpc-server";
import { Octokit } from "@octokit/rest";
import { ChatService } from "@superset/chat/server/desktop";
import type { MiddlewareHandler } from "hono";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { createApiClient } from "./api";
import { createDb, type HostDb } from "./db";
import { EventBus, registerEventBusRoute } from "./events";
import type { ApiAuthProvider } from "./providers/auth";
import type { HostAuthProvider } from "./providers/host-auth";
import type { ModelProviderRuntimeResolver } from "./providers/model-providers";
import { ChatRuntimeManager } from "./runtime/chat";
import { WorkspaceFilesystemManager } from "./runtime/filesystem";
import type { GitCredentialProvider } from "./runtime/git";
import { createGitFactory } from "./runtime/git";
import { runMainWorkspaceSweep } from "./runtime/main-workspace-sweep";
import { PullRequestRuntimeManager } from "./runtime/pull-requests";
import { registerWorkspaceTerminalRoute } from "./terminal/terminal";
import { appRouter } from "./trpc/router";
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
	chatRuntime?: ChatRuntimeManager;
	chatService?: ChatService;
}

export interface CreateAppResult {
	app: Hono;
	injectWebSocket: ReturnType<typeof createNodeWebSocket>["injectWebSocket"];
	api: ApiClient;
	dispose: () => Promise<void>;
}

export function createApp(options: CreateAppOptions): CreateAppResult {
	const { config, providers } = options;

	const api =
		options.api ?? createApiClient(config.cloudApiUrl, providers.auth);
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

	const pullRequestRuntime = new PullRequestRuntimeManager({
		db,
		git,
		github,
	});
	pullRequestRuntime.start();
	const filesystem = new WorkspaceFilesystemManager({ db });
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

	const runtime = {
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
			allowHeaders: ["Content-Type", "Authorization", "trpc-accept"],
		}),
	);

	const eventBus = new EventBus({ db, filesystem });
	eventBus.start();

	// Backfill `kind='main'` v2 workspaces for projects already set up before
	// this column shipped. Idempotent; runs in the background so it doesn't
	// block server startup.
	void runMainWorkspaceSweep({
		api,
		db,
		git,
		organizationId: config.organizationId,
	}).catch((err) => {
		console.warn("[host-service] main-workspace sweep failed:", err);
	});

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

	registerEventBusRoute({ app, eventBus, upgradeWebSocket });
	registerWorkspaceTerminalRoute({
		app,
		db,
		eventBus,
		upgradeWebSocket,
	});

	app.use(
		"/trpc/*",
		trpcServer({
			router: appRouter,
			createContext: async (_opts, c) => {
				const isAuthenticated = await providers.hostAuth.validate(c.req.raw);
				return {
					git,
					github,
					api,
					db,
					runtime,
					eventBus,
					organizationId: config.organizationId,
					isAuthenticated,
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
			eventBus.close();
		} catch (err) {
			console.warn("[host-service] eventBus.close failed:", err);
		}
		if (ownsDb) {
			try {
				(db as unknown as { $client?: { close: () => void } }).$client?.close();
			} catch {
				// best-effort close; tests should not fail on teardown
			}
		}
	};

	return { app, injectWebSocket, api, dispose };
}
