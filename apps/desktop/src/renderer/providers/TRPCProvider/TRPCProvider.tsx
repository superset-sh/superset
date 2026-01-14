import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpBatchLink } from "@trpc/client";
import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import { env } from "renderer/env.renderer";
import { getAuthToken } from "renderer/lib/auth-client";
import { trpc } from "renderer/lib/trpc";
import superjson from "superjson";

export function TRPCProvider({ children }: { children: ReactNode }) {
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

	const apiClient = useMemo(() => {
		return trpc.createClient({
			links: [
				httpBatchLink({
					url: `${env.NEXT_PUBLIC_API_URL}/api/trpc`,
					headers() {
						const token = getAuthToken();
						return token ? { Authorization: `Bearer ${token}` } : {};
					},
					transformer: superjson,
				}),
			],
		});
	}, []);

	return (
		<trpc.Provider client={apiClient} queryClient={queryClient}>
			<QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
		</trpc.Provider>
	);
}
