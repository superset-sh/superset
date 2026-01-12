import { createTRPCProxyClient } from "@trpc/client";
import type { AppRouter } from "lib/trpc/routers";
import superjson from "superjson";
import { ipcLink } from "trpc-electron/renderer";
import { sessionIdLink } from "./session-id-link";
import { trpc } from "./trpc";

/**
 * tRPC client for React hooks (used by TRPCProvider).
 *
 * Uses sessionIdLink to assign globally unique IDs, preventing collisions
 * with the proxy client below.
 */
export const reactClient = trpc.createClient({
	links: [sessionIdLink(), ipcLink({ transformer: superjson })],
});

/**
 * tRPC proxy client for imperative calls from stores, utilities, etc.
 * Use this when you need to call tRPC procedures outside of React components.
 *
 * Uses sessionIdLink to assign globally unique IDs, preventing collisions
 * with the React client above.
 */
export const trpcClient = createTRPCProxyClient<AppRouter>({
	links: [sessionIdLink(), ipcLink({ transformer: superjson })],
});
