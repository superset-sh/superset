import { trpcServer } from "@hono/trpc-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { LocalCredentialProvider } from "./git/providers";
import type { CredentialProvider } from "./git/types";
import { createContextFactory } from "./trpc/context";
import { appRouter } from "./trpc/router";

export interface CreateAppOptions {
	credentials?: CredentialProvider;
}

export function createApp(options?: CreateAppOptions) {
	const provider = options?.credentials ?? new LocalCredentialProvider();
	const createContext = createContextFactory(provider);

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
