import type { QueryClient } from "@tanstack/react-query";
import { apiTrpc } from "renderer/lib/api-trpc";
import { apiReactClient } from "renderer/lib/api-trpc-client";

interface ApiTRPCProviderProps {
	children: React.ReactNode;
	queryClient: QueryClient;
}

/**
 * Provider for API HTTP tRPC client.
 * Shares QueryClient with ElectronTRPCProvider for unified caching.
 */
export function ApiTRPCProvider({
	children,
	queryClient,
}: ApiTRPCProviderProps) {
	return (
		<apiTrpc.Provider client={apiReactClient} queryClient={queryClient}>
			{children}
		</apiTrpc.Provider>
	);
}
