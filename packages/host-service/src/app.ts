import { homedir } from "node:os";
import { join } from "node:path";
import { createNodeWebSocket } from "@hono/node-ws";
import { trpcServer } from "@hono/trpc-server";
import { Octokit } from "@octokit/rest";
import type { MiddlewareHandler } from "hono";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { createApiClient } from "./api";
import { createDb } from "./db";
import { registerWorkspaceFilesystemEventsRoute } from "./filesystem";
import type { ApiAuthProvider } from "./providers/auth";
import { LocalGitCredentialProvider } from "./providers/git";
import type { HostAuthProvider } from "./providers/host-auth";
import {
	LocalModelProvider,
	type ModelProviderRuntimeResolver,
} from "./providers/model-providers";
import { ChatRuntimeManager } from "./runtime/chat";
import { WorkspaceFilesystemManager } from "./runtime/filesystem";
import type { GitCredentialProvider } from "./runtime/git";
import { createGitFactory } from "./runtime/git";
import { PullRequestRuntimeManager } from "./runtime/pull-requests";
import { registerWorkspaceTerminalRoute } from "./terminal/terminal";
import { appRouter } from "./trpc/router";

export interface CreateAppOptions {
	credentials?: GitCredentialProvider;
	modelProviderRuntimeResolver?: ModelProviderRuntimeResolver;
	auth?: ApiAuthProvider;
	hostAuth?: HostAuthProvider;
	cloudApiUrl?: string;
	dbPath?: string;
	deviceClientId?: string;
	deviceName?: string;
	allowedOrigins?: string[];
}

export interface CreateAppResult {
	app: Hono;
	injectWebSocket: ReturnType<typeof createNodeWebSocket>["injectWebSocket"];
}

export function createApp(options?: CreateAppOptions): CreateAppResult {
	const credentials = options?.credentials ?? new LocalGitCredentialProvider();

	const api =
		options?.auth && options?.cloudApiUrl
			? createApiClient(options.cloudApiUrl, options.auth)
			: null;

	const dbPath = options?.dbPath ?? join(homedir(), ".superset", "host.db");
	const db = createDb(dbPath);
	const git = createGitFactory(credentials);
	const modelProviderRuntimeResolver =
		options?.modelProviderRuntimeResolver ?? new LocalModelProvider();
	const github = async () => {
		const token = await credentials.getToken("github.com");
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
		runtimeResolver: modelProviderRuntimeResolver,
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
			origin: options?.allowedOrigins ?? [],
			allowHeaders: ["Content-Type", "Authorization"],
		}),
	);

	if (options?.hostAuth) {
		const { hostAuth } = options;
		const wsAuth: MiddlewareHandler = async (c, next) => {
			const token = c.req.query("token");
			const authorized =
				(await hostAuth.validate(c.req.raw)) ||
				(token && (await hostAuth.validateToken(token)));
			if (!authorized) return c.json({ error: "Unauthorized" }, 401);
			return next();
		};
		app.use("/terminal/*", wsAuth);
		app.use("/workspace-filesystem/*", wsAuth);
	}

	registerWorkspaceFilesystemEventsRoute({
		app,
		filesystem,
		upgradeWebSocket,
	});
	registerWorkspaceTerminalRoute({
		app,
		db,
		upgradeWebSocket,
	});

	const hostAuth = options?.hostAuth;
	app.use(
		"/trpc/*",
		trpcServer({
			router: appRouter,
			createContext: async (_opts, c) => {
				const isAuthenticated = hostAuth
					? await hostAuth.validate(c.req.raw)
					: false;
				return {
					git,
					github,
					api,
					db,
					runtime,
					deviceClientId: options?.deviceClientId ?? null,
					deviceName: options?.deviceName ?? null,
					isAuthenticated,
				} as Record<string, unknown>;
			},
		}),
	);

	return { app, injectWebSocket };
}
