import { createTRPCProxyClient } from "@trpc/client";
import type { AppRouter } from "lib/trpc/routers";
import superjson from "superjson";
import { ipcLink } from "trpc-electron/renderer";

/**
 * Use this when you need to call tRPC procedures from stores, utilities, etc.
 */
export const trpcClient = createTRPCProxyClient<AppRouter>({
	links: [ipcLink({ transformer: superjson })],
});
