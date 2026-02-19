import {
	createContext,
	type ReactNode,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useState,
} from "react";
import { env } from "renderer/env.renderer";
import { authClient } from "renderer/lib/auth-client";
import { MOCK_ORG_ID } from "shared/constants";
import { getCollections, preloadCollections } from "./collections";

type CollectionsContextType = ReturnType<typeof getCollections> & {
	switchOrganization: (organizationId: string) => Promise<void>;
};

const CollectionsContext = createContext<CollectionsContextType | null>(null);

export function CollectionsProvider({ children }: { children: ReactNode }) {
	const { data: session, refetch: refetchSession } = authClient.useSession();
	const activeOrganizationId = env.SKIP_ENV_VALIDATION
		? MOCK_ORG_ID
		: session?.session?.activeOrganizationId;
	const [isSwitching, setIsSwitching] = useState(false);

	const switchOrganization = useCallback(
		async (organizationId: string) => {
			if (organizationId === activeOrganizationId) return;
			setIsSwitching(true);
			try {
				await authClient.organization.setActive({ organizationId });
				await Promise.all([
					preloadCollections(organizationId),
					refetchSession(),
				]);
			} finally {
				setIsSwitching(false);
			}
		},
		[activeOrganizationId, refetchSession],
	);

	// Preload collections for all orgs the user belongs to.
	// Collections are lazy — they don't sync until subscribed or preloaded.
	// This starts Electric subscriptions eagerly so data is ready on org switch.
	const organizationIds = session?.session?.organizationIds;
	useEffect(() => {
		if (!organizationIds) return;
		for (const orgId of organizationIds) {
			preloadCollections(orgId);
		}
	}, [organizationIds]);

	const collections = useMemo(() => {
		if (!activeOrganizationId) {
			return null;
		}

		return getCollections(activeOrganizationId);
	}, [activeOrganizationId]);

	if (!collections || isSwitching) {
		return null;
	}

	return (
		<CollectionsContext.Provider value={{ ...collections, switchOrganization }}>
			{children}
		</CollectionsContext.Provider>
	);
}

export function useCollections(): CollectionsContextType {
	const context = useContext(CollectionsContext);
	if (!context) {
		throw new Error("useCollections must be used within CollectionsProvider");
	}
	return context;
}
