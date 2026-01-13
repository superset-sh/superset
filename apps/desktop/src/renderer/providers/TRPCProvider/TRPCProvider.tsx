import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { trpc } from "lib/trpc";
import { useState } from "react";
import { reactClient } from "../../lib/trpc-client";

export function TRPCProvider({ children }: { children: React.ReactNode }) {
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
		<trpc.Provider client={reactClient} queryClient={queryClient}>
			<QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
		</trpc.Provider>
	);
}
