import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { electronReactClient } from "../../lib/trpc-client";

/**
 * Provider for Electron IPC tRPC client.
 * For desktop-specific operations: workspaces, terminal, auth, etc.
 */
export function ElectronTRPCProvider({
	children,
}: {
	children: React.ReactNode;
}) {
	const [queryClient] = useState(
		() =>
			new QueryClient({
				defaultOptions: {
					queries: {
						networkMode: "always",
						retry: false,
					},
					mutations: {
						networkMode: "always",
						retry: false,
					},
				},
			}),
	);

	return (
		<electronTrpc.Provider
			client={electronReactClient}
			queryClient={queryClient}
		>
			<QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
		</electronTrpc.Provider>
	);
}
