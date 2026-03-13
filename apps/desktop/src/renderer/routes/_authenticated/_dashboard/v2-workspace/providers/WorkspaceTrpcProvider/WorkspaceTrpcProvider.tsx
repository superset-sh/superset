import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpBatchLink } from "@trpc/client";
import { type ReactNode, useMemo } from "react";
import { workspaceTrpc } from "renderer/lib/workspace-trpc";
import superjson from "superjson";

interface WorkspaceTrpcProviderProps {
	hostUrl: string;
	children: ReactNode;
}

export function WorkspaceTrpcProvider({
	hostUrl,
	children,
}: WorkspaceTrpcProviderProps) {
	const { queryClient, trpcClient } = useMemo(() => {
		const qc = new QueryClient({
			defaultOptions: {
				queries: {
					refetchOnWindowFocus: false,
					retry: 1,
				},
			},
		});

		const tc = workspaceTrpc.createClient({
			links: [
				httpBatchLink({
					url: `${hostUrl}/trpc`,
					transformer: superjson,
				}),
			],
		});

		return { queryClient: qc, trpcClient: tc };
	}, [hostUrl]);

	return (
		<workspaceTrpc.Provider client={trpcClient} queryClient={queryClient}>
			<QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
		</workspaceTrpc.Provider>
	);
}
