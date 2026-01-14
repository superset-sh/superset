import { createContext, type ReactNode, useContext, useMemo } from "react";
import { trpc } from "renderer/lib/trpc";
import {
	type ApiClient,
	createApiClient,
	getCollections,
} from "./collections";

type Collections = ReturnType<typeof getCollections>;

interface CollectionsContextValue {
	collections: Collections;
	apiClient: ApiClient;
	token: string;
}

const CollectionsContext = createContext<CollectionsContextValue | null>(null);

export function CollectionsProvider({ children }: { children: ReactNode }) {
	const { data: authState } = trpc.auth.onAuthState.useSubscription();

	const activeOrganizationId = authState?.session?.activeOrganizationId;
	const token = authState?.token;

	const contextValue = useMemo(() => {
		if (!token || !activeOrganizationId) {
			return null;
		}

		// Get cached collections for this org (or create if first time)
		const collections = getCollections(activeOrganizationId, token);
		const apiClient = createApiClient(token);

		return { collections, apiClient, token };
	}, [token, activeOrganizationId]);

	// Show loading only on initial mount
	if (!contextValue) {
		return (
			<div className="flex items-center justify-center h-screen">
				<div className="h-8 w-8 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
			</div>
		);
	}

	return (
		<CollectionsContext.Provider value={contextValue}>
			{children}
		</CollectionsContext.Provider>
	);
}

function useCollectionsContext() {
	const context = useContext(CollectionsContext);
	if (!context) {
		throw new Error("useCollections must be used within CollectionsProvider");
	}
	return context;
}

export function useCollections(): Collections {
	return useCollectionsContext().collections;
}

export function useApiClient(): ApiClient {
	return useCollectionsContext().apiClient;
}
