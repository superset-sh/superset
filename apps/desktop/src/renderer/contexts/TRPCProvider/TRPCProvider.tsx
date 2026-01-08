import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { trpc } from "lib/trpc";
import superjson from "superjson";
import { ipcLink } from "trpc-electron/renderer";

// Export as singletons for use outside React components (e.g., in stores)
export const queryClient = new QueryClient({
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
});

export const trpcClient = trpc.createClient({
	links: [ipcLink({ transformer: superjson })],
});

export function TRPCProvider({ children }: { children: React.ReactNode }) {
	return (
		<trpc.Provider client={trpcClient} queryClient={queryClient}>
			<QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
		</trpc.Provider>
	);
}
