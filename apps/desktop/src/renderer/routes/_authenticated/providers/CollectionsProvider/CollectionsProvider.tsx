import { createContext, type ReactNode, useContext, useMemo } from "react";
import { env } from "renderer/env.renderer";
import { authClient } from "renderer/lib/auth-client";
import { MOCK_ORG_ID } from "shared/constants";
import { getCollections } from "./collections";

type Collections = ReturnType<typeof getCollections>;

const CollectionsContext = createContext<Collections | null>(null);

export function CollectionsProvider({ children }: { children: ReactNode }) {
	const { data: session } = authClient.useSession();
	const activeOrganizationId = env.SKIP_ENV_VALIDATION
		? MOCK_ORG_ID
		: session?.session?.activeOrganizationId;

	const collections = useMemo(() => {
		if (!activeOrganizationId) {
			return null;
		}

		return getCollections(activeOrganizationId);
	}, [activeOrganizationId]);

	if (!collections) {
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
	if (!context) {
		throw new Error("useCollections must be used within CollectionsProvider");
	}
	return context;
}
