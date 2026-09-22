import type { AppRouter } from "@superset/trpc";
import { httpBatchStreamLink } from "@trpc/client";
import { createTRPCReact } from "@trpc/react-query";
import { createContext } from "react";
import { env } from "renderer/env.renderer";
import superjson from "superjson";
import { getCloudRequestHeaders } from "./cloudRequestContext";

export { setCloudOrganizationId } from "./cloudRequestContext";

// Dedicated context — the library default is shared across all
// createTRPCReact clients; without this, cloudTrpc.Provider shadows
// electronTrpc's hooks for everything mounted beneath it (its
// httpBatchStreamLink then rejects electron IPC subscriptions).
const cloudTrpcContext = createContext(null);

/**
 * React Query hooks for the cloud API. Use this for reading cloud data in
 * components; use `apiTrpcClient` for imperative calls outside React.
 * Distinct from `electronTrpc` (main-process IPC) and `workspaceTrpc`
 * (host-service).
 */
export const cloudTrpc = createTRPCReact<AppRouter>({
	context: cloudTrpcContext,
});

/**
 * Cloud router roots on the shared renderer QueryClient. Drives the 30s
 * staleTime default (set once in ElectronTRPCProvider, not per call site)
 * and the org-switch cache purge. "analytics" and "device" exist on the
 * electron IPC router too and are deliberately absent — their cloud queries
 * fall back to per-site options.
 */
export const CLOUD_TRPC_ROUTER_ROOTS = [
	"admin",
	"agentCredential",
	"apiKey",
	"automation",
	"billing",
	"chat",
	"environment",
	"githubUser",
	"host",
	"integration",
	"organization",
	"page",
	"pageComment",
	"plugins",
	"support",
	"task",
	"team",
	"user",
	"v2Project",
] as const;

export const cloudTrpcClient = cloudTrpc.createClient({
	links: [
		httpBatchStreamLink({
			url: `${env.NEXT_PUBLIC_API_URL}/api/trpc`,
			transformer: superjson,
			headers: getCloudRequestHeaders,
		}),
	],
});
