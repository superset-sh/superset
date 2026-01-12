import { createTRPCProxyClient } from "@trpc/client";
import type { AppRouter } from "lib/trpc/routers";
import superjson from "superjson";
import { ipcLink } from "trpc-electron/renderer";
import { trpc } from "./trpc";

/**
 * Shared ipcLink instance used by both React and imperative clients.
 *
 * IMPORTANT: Both clients MUST share the same link to prevent ID collisions.
 * Each ipcLink creates its own IPCClient with a separate ID counter.
 * If two links exist, operations can get the same ID, causing responses
 * to be misrouted (e.g., mutation response going to a subscription).
 */
const sharedIpcLink = ipcLink({ transformer: superjson });

/**
 * tRPC client for React hooks (used by TRPCProvider).
 */
export const reactClient = trpc.createClient({
	links: [sharedIpcLink],
});

/**
 * tRPC proxy client for imperative calls from stores, utilities, etc.
 * Use this when you need to call tRPC procedures outside of React components.
 */
export const trpcClient = createTRPCProxyClient<AppRouter>({
	links: [sharedIpcLink],
});
