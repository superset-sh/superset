import { createNodeWebSocket } from "@hono/node-ws";
import { trpcServer } from "@hono/trpc-server";
import { Octokit } from "@octokit/rest";
import type { MiddlewareHandler } from "hono";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { createApiClient } from "./api";
import { createDb } from "./db";
import { EventBus, registerEventBusRoute } from "./events";
import type { ApiAuthProvider } from "./providers/auth";
import type { HostAuthProvider } from "./providers/host-auth";
import type { ModelProviderRuntimeResolver } from "./providers/model-providers";
import { ChatRuntimeManager } from "./runtime/chat";
import { WorkspaceFilesystemManager } from "./runtime/filesystem";
import type { GitCredentialProvider } from "./runtime/git";
import { createGitFactory } from "./runtime/git";
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
}

export interface CreateAppResult {
	app: Hono;
	injectWebSocket: ReturnType<typeof createNodeWebSocket>["injectWebSocket"];
	api: ApiClient;
}

export function createApp(options: CreateAppOptions): CreateAppResult {
	const { config, providers } = options;

	const api = createApiClient(config.cloudApiUrl, providers.auth);
	const db = createDb(config.dbPath, config.migrationsFolder);
	const git = createGitFactory(providers.credentials);
	const github = async () => {
		const token = await providers.credentials.getToken("github.com");
		if (!token) {
			throw new Error(
				"No GitHub token available. Set GITHUB_TOKEN/GH_TOKEN or authenticate via git credential manager.",
			);
		}
		return new Octokit({ auth: token });
	};

	const pullRequestRuntime = new PullRequestRuntimeManager({
		db,
		git,
		github,
	});
	pullRequestRuntime.start();
	const filesystem = new WorkspaceFilesystemManager({ db });
	const chatRuntime = new ChatRuntimeManager({
		db,
		runtimeResolver: providers.modelResolver,
	});

	const runtime = {
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

	return { app, injectWebSocket, api };
}
