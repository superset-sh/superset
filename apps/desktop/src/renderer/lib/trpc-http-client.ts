import type { AppRouter } from "@superset/trpc";
import { createTRPCProxyClient, httpBatchLink } from "@trpc/client";
import superjson from "superjson";

/**
 * HTTP-based tRPC client for making API calls to the backend server.
 * Used in TanStack DB collections for write operations.
 *
 * Note: This is different from the IPC-based trpcClient which is used
 * for calling procedures in the main Electron process.
 */
export const createHttpTrpcClient = ({
	headers,
}: {
	headers?: Record<string, string>;
} = {}) => {
	return createTRPCProxyClient<AppRouter>({
		links: [
			httpBatchLink({
				url: `${import.meta.env.VITE_API_URL}/trpc`,
				headers,
				transformer: superjson,
			}),
		],
	});
};
