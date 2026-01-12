import { createTRPCProxyClient } from "@trpc/client";
import type { AppRouter } from "lib/trpc/routers";
import superjson from "superjson";
import { ipcLink } from "trpc-electron/renderer";
import { sessionIdLink } from "./session-id-link";
import { trpc } from "./trpc";

/**
 * tRPC client for React hooks (used by TRPCProvider).
 *
 * Uses sessionIdLink to assign globally unique operation IDs, preventing
 * collisions with the proxy client. This is necessary because:
 * - Each tRPC client calls the ipcLink factory, creating separate IPCClients
 * - Each IPCClient registers its own message handler (all receive all responses)
 * - Each tRPC client generates IDs independently (1, 2, 3...)
 * - Without unique IDs, responses can be routed to the wrong client
 */
export const reactClient = trpc.createClient({
	links: [sessionIdLink(), ipcLink({ transformer: superjson })],
});

/**
 * tRPC proxy client for imperative calls from stores, utilities, etc.
 * Use this when you need to call tRPC procedures outside of React components.
 */
export const trpcClient = createTRPCProxyClient<AppRouter>({
	links: [sessionIdLink(), ipcLink({ transformer: superjson })],
});
