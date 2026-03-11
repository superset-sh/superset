import { trpcServer } from "@hono/trpc-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { createApiClient } from "./api";
import type { AuthProvider } from "./auth/types";
import { LocalCredentialProvider } from "./git/providers";
import type { CredentialProvider } from "./git/types";
import { createContextFactory } from "./trpc/context";
import { appRouter } from "./trpc/router";

export interface CreateAppOptions {
	credentials?: CredentialProvider;
	auth?: AuthProvider;
	cloudApiUrl?: string;
}

export function createApp(options?: CreateAppOptions) {
	const credentials = options?.credentials ?? new LocalCredentialProvider();

	const api =
		options?.auth && options?.cloudApiUrl
			? createApiClient(options.cloudApiUrl, options.auth)
			: null;

	const createContext = createContextFactory({ credentials, api });

	const app = new Hono();
	app.use("*", cors());
	app.use(
		"/trpc/*",
		trpcServer({
			router: appRouter,
			createContext: () =>
				createContext() as unknown as Record<string, unknown>,
		}),
	);

	return app;
}
