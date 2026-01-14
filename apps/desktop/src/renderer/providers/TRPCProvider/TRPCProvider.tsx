import { QueryClientProvider } from "@tanstack/react-query";
import { trpc } from "lib/trpc";
import { queryClient } from "../../lib/query-client";
import { reactClient } from "../../lib/trpc-client";

export function TRPCProvider({ children }: { children: React.ReactNode }) {
	return (
		<trpc.Provider client={reactClient} queryClient={queryClient}>
			<QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
		</trpc.Provider>
	);
}
