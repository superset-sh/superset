import type { ReactNode } from "react";
import { createContext, useContext, useMemo } from "react";
import { useSession } from "@/lib/auth/client";
import { getCollections } from "@/lib/collections/collections";

type Collections = ReturnType<typeof getCollections>;
const CollectionsContext = createContext<Collections | null>(null);

export function CollectionsProvider({ children }: { children: ReactNode }) {
	const { data: session } = useSession();
	const activeOrganizationId = session?.session?.activeOrganizationId;

	const collections = useMemo(() => {
		if (!activeOrganizationId) return null;
		return getCollections(activeOrganizationId);
	}, [activeOrganizationId]);

	if (!activeOrganizationId) {
		return null;
	}

	return (
		<CollectionsContext.Provider value={collections}>
			{children}
		</CollectionsContext.Provider>
	);
}

export function useCollections(): Collections {
	const context = useContext(CollectionsContext);
	if (context === undefined) {
		throw new Error("useCollections must be used within CollectionsProvider");
	}
	if (!context) {
		throw new Error(
			"Collections not available - user must be signed in with an active organization",
		);
	}
	return context;
}
