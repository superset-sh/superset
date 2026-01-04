import {
	createContext,
	type ReactNode,
	useContext,
	useMemo,
	useRef,
} from "react";
import { createCollections, type Collections } from "renderer/collections";
import { env } from "renderer/env.renderer";
import { useAuth } from "./AuthProvider";
import { useOrganization } from "./OrganizationProvider";

const CollectionsContext = createContext<Collections | null>(null);

export function CollectionsProvider({ children }: { children: ReactNode }) {
	const { accessToken } = useAuth();
	const { activeOrganizationId } = useOrganization();

	// Stable map of collections per org (never recreate collections, just cache them)
	const collectionsCache = useRef<Map<string, Collections>>(new Map());

	const collections = useMemo(() => {
		if (!activeOrganizationId) return null;

		const cached = collectionsCache.current.get(activeOrganizationId);
		if (cached) return cached;

		const headers = { Authorization: `Bearer ${accessToken}` };
		const electricUrl = `${env.NEXT_PUBLIC_API_URL}/api/electric/v1/shape?organizationId=${activeOrganizationId}`;

		const newCollections = createCollections({
			orgId: activeOrganizationId,
			electricUrl,
			apiUrl: env.NEXT_PUBLIC_API_URL,
			headers,
		});

		collectionsCache.current.set(activeOrganizationId, newCollections);
		return newCollections;
	}, [activeOrganizationId, accessToken]);

	if (!collections) {
		return null;
	}

	return (
		<CollectionsContext.Provider value={collections}>
			{children}
		</CollectionsContext.Provider>
	);
}

export const useCollections = () => {
	const collections = useContext(CollectionsContext);
	if (!collections) {
		throw new Error("useCollections must be used within CollectionsProvider");
	}
	return collections;
};
