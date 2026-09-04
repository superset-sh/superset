import { ORGANIZATION_HEADER } from "@superset/shared/constants";
import type { AppRouter } from "@superset/trpc";
import { httpBatchStreamLink } from "@trpc/client";
import { createTRPCReact } from "@trpc/react-query";
import { createContext } from "react";
import { env } from "renderer/env.renderer";
import superjson from "superjson";
import { getAuthToken } from "./auth-client";

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
	"apiKey",
	"automation",
	"billing",
	"chat",
	"environment",
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
	"v2Host",
	"v2Project",
] as const;

/**
 * The organization this window's cloud reads are scoped to.
 *
 * Module state is per-renderer, and every window is its own renderer, so this
 * is per-window by construction — two windows cannot see each other's value.
 * Without it the API falls back to the login session's active organization,
 * which is shared by every window: a window switched to another org would read
 * the first window's data.
 *
 * Null until CollectionsProvider resolves the window's org, which is also the
 * pre-sign-in state; the API then applies its session default as before.
 */
let cloudOrganizationId: string | null = null;

export function setCloudOrganizationId(organizationId: string | null): void {
	cloudOrganizationId = organizationId;
}

export const cloudTrpcClient = cloudTrpc.createClient({
	links: [
		httpBatchStreamLink({
			url: `${env.NEXT_PUBLIC_API_URL}/api/trpc`,
			transformer: superjson,
			// Read per request, never captured: the window's org changes while
			// this client lives, and a stale capture would pin every later read
			// to the org the window started on.
			headers: () => ({
				...(getAuthToken()
					? { Authorization: `Bearer ${getAuthToken()}` }
					: {}),
				...(cloudOrganizationId
					? { [ORGANIZATION_HEADER]: cloudOrganizationId }
					: {}),
			}),
		}),
	],
});
