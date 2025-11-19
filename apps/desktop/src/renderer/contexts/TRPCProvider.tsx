import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { trpc } from "lib/trpc";
import { useState } from "react";
import superjson from "superjson";
import { ipcLink } from "trpc-electron/renderer";

export function TRPCProvider({ children }: { children: React.ReactNode }) {
	const [queryClient] = useState(() => new QueryClient());
	const [trpcClient] = useState(() =>
		trpc.createClient({
			links: [ipcLink({ transformer: superjson })],
		}),
	);
	return (
		<trpc.Provider client={trpcClient} queryClient={queryClient}>
			<QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
		</trpc.Provider>
	);
}
