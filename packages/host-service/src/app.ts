import { homedir } from "node:os";
import { join } from "node:path";
import { createNodeWebSocket } from "@hono/node-ws";
import { trpcServer } from "@hono/trpc-server";
import { Octokit } from "@octokit/rest";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { createApiClient } from "./api";
import { createDb } from "./db";
import { registerWorkspaceFilesystemEventsRoute } from "./filesystem";
import type { AuthProvider } from "./providers/auth";
import { LocalGitCredentialProvider } from "./providers/git";
import {
	LocalModelProvider,
	type ModelProviderRuntimeResolver,
} from "./providers/model-providers";
import { ChatRuntimeManager } from "./runtime/chat";
import { WorkspaceFilesystemManager } from "./runtime/filesystem";
import type { GitCredentialProvider } from "./runtime/git";
import { createGitFactory } from "./runtime/git";
import { PullRequestRuntimeManager } from "./runtime/pull-requests";
import { secureCompare } from "./security";
import { registerWorkspaceTerminalRoute } from "./terminal/terminal";
import { appRouter } from "./trpc/router";

export interface CreateAppOptions {
	credentials?: GitCredentialProvider;
	modelProviderRuntimeResolver?: ModelProviderRuntimeResolver;
	auth?: AuthProvider;
	cloudApiUrl?: string;
	dbPath?: string;
	deviceClientId?: string;
	deviceName?: string;
	/**
	 * Session token for authenticating requests from the Electron app.
	 * This prevents unauthorized access from malicious websites.
	 */
	sessionToken?: string;
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

	// SECURITY: Strict CORS - only allow localhost origins to prevent cross-origin attacks
	app.use(
		"*",
		cors({
			origin: (origin) => {
				// Allow requests from localhost, 127.0.0.1, and Electron app protocols
				if (!origin) return null; // Block requests with no origin

				try {
					const url = new URL(origin);
					const isLocalhost =
						url.hostname === "localhost" ||
						url.hostname === "127.0.0.1" ||
						url.hostname === "[::1]";
					const isElectron = url.protocol === "app:"; // Electron custom protocol

					return isLocalhost || isElectron ? origin : null;
				} catch {
					// Reject malformed origins
					return null;
				}
			},
			credentials: true,
		}),
	);

	// SECURITY: Authentication middleware - validate session token on ALL requests
	// This prevents unauthorized access from malicious websites
	if (options?.sessionToken) {
		const expectedToken = options.sessionToken; // Capture for type safety
		app.use("*", async (c, next) => {
			// Allow CORS preflight requests
			if (c.req.method === "OPTIONS") {
				return next();
			}

			const authHeader =
				c.req.header("Authorization") || c.req.header("X-Session-Token");

			if (!authHeader) {
				return c.json({ error: "Unauthorized: Missing session token" }, 401);
			}

			// Extract token (support both "Bearer <token>" and raw token formats)
			const token = authHeader.startsWith("Bearer ")
				? authHeader.slice(7)
				: authHeader;

			// Use constant-time comparison to prevent timing attacks
			if (!secureCompare(token, expectedToken)) {
				return c.json({ error: "Unauthorized: Invalid session token" }, 401);
			}

			return next();
		});
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
	app.use(
		"/trpc/*",
		trpcServer({
			router: appRouter,
			createContext: async () =>
				({
					git,
					github,
					api,
					db,
					runtime,
					deviceClientId: options?.deviceClientId ?? null,
					deviceName: options?.deviceName ?? null,
				}) as Record<string, unknown>,
		}),
	);

	return { app, injectWebSocket };
}
