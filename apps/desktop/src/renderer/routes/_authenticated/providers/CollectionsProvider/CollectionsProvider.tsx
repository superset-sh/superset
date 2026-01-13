import { authClient } from "renderer/lib/auth-client";
import { createContext, type ReactNode, useContext, useMemo } from "react";
import { useAuthToken } from "renderer/providers/AuthProvider";
import { getCollections } from "./collections";

type Collections = ReturnType<typeof getCollections>;

const CollectionsContext = createContext<Collections | null>(null);

export function CollectionsProvider({ children }: { children: ReactNode }) {
	const { data: session } = authClient.useSession();
	const token = useAuthToken();
	const activeOrganizationId = session?.session?.activeOrganizationId;

	const collections = useMemo(() => {
		if (!token || !activeOrganizationId) {
			return null;
		}

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
