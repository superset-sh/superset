import type { AppRouter } from "@superset/trpc";
import type { TRPCClient } from "@trpc/client";
import { createContext, type ReactNode, useContext } from "react";

const CloudClientContext = createContext<TRPCClient<AppRouter> | null>(null);

interface CloudClientProviderProps {
	client: TRPCClient<AppRouter>;
	children: ReactNode;
}

export function CloudClientProvider({
	client,
	children,
}: CloudClientProviderProps) {
	return (
		<CloudClientContext.Provider value={client}>
			{children}
		</CloudClientContext.Provider>
	);
}

export function useCloudClient(): TRPCClient<AppRouter> {
	const client = useContext(CloudClientContext);
	if (!client) {
		throw new Error("useCloudClient must be used within CloudClientProvider");
	}
	return client;
}
