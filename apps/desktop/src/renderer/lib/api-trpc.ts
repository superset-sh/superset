import type { AppRouter } from "@superset/trpc";
import { createTRPCReact } from "@trpc/react-query";
import type { inferRouterOutputs } from "@trpc/server";

/**
 * tRPC React client for HTTP communication with API server.
 * For cloud features: cloud workspaces, organization data, etc.
 */
export const apiTrpc = createTRPCReact<AppRouter>({
	abortOnUnmount: true,
});

export type ApiRouterOutputs = inferRouterOutputs<AppRouter>;
