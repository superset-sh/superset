import { createContext, type ReactNode, useContext, useMemo } from "react";
import { trpc } from "renderer/lib/trpc";
import { getCollections } from "./collections";

type Collections = ReturnType<typeof getCollections>;

const CollectionsContext = createContext<Collections | null>(null);

export function CollectionsProvider({ children }: { children: ReactNode }) {
	const { data: authState } = trpc.auth.onAuthState.useSubscription();

	const activeOrganizationId = authState?.session?.activeOrganizationId;
	const token = authState?.token;

	const collections = useMemo(() => {
		if (!token || !activeOrganizationId) {
			return null;
		}

		// Get cached collections for this org (or create if first time)
		return getCollections(activeOrganizationId, token);
	}, [token, activeOrganizationId]);

	// Show loading only on initial mount
	if (!collections) {
		return (
			<div className="flex items-center justify-center h-screen">
				<div className="h-8 w-8 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
			</div>
		);
	}

	return (
		<CollectionsContext.Provider value={collections}>
			{children}
		</CollectionsContext.Provider>
	);
}

export function useCollections(): Collections {
	const context = useContext(CollectionsContext);
	if (!context) {
		throw new Error("useCollections must be used within CollectionsProvider");
	}
	return context;
}
