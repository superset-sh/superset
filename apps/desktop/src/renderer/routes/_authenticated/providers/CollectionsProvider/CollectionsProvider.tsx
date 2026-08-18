import {
	createContext,
	type ReactNode,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { env } from "renderer/env.renderer";
import { authClient } from "renderer/lib/auth-client";
import { CLOUD_TRPC_ROUTER_ROOTS } from "renderer/lib/cloud-trpc";
import { electronQueryClient } from "renderer/providers/ElectronTRPCProvider/ElectronTRPCProvider";
import { MOCK_ORG_ID } from "shared/constants";
import {
	evictInactiveOrgCollections,
	getCollections,
	preloadCollections,
} from "./collections";

// Cloud query procedures take no organizationId input (the server scopes by
// active org), so their React Query keys don't encode the org — on org switch
// the previous org's rows must be dropped, not just marked stale.
const ORG_SCOPED_CLOUD_ROUTERS = new Set<string>(CLOUD_TRPC_ROUTER_ROOTS);

function dropCloudQueriesForOrgSwitch(): void {
	electronQueryClient.removeQueries({
		predicate: (query) => {
			const head = query.queryKey[0];
			return (
				Array.isArray(head) &&
				typeof head[0] === "string" &&
				ORG_SCOPED_CLOUD_ROUTERS.has(head[0])
			);
		},
	});
}

type CollectionsContextType = ReturnType<typeof getCollections> & {
	switchOrganization: (organizationId: string) => Promise<void>;
};

const CollectionsContext = createContext<CollectionsContextType | null>(null);

export function preloadActiveOrganizationCollections(
	activeOrganizationId: string | null | undefined,
): void {
	if (!activeOrganizationId) return;
	void preloadCollections(activeOrganizationId).catch((error) => {
		console.error(
			"[collections-provider] Failed to preload active org collections:",
			error,
		);
	});
}

export function CollectionsProvider({ children }: { children: ReactNode }) {
	const { data: session, refetch: refetchSession } = authClient.useSession();
	const [isSwitching, setIsSwitching] = useState(false);
	const activeOrganizationId = env.SKIP_ENV_VALIDATION
		? MOCK_ORG_ID
		: session?.session?.activeOrganizationId;

	const switchOrganization = useCallback(
		async (organizationId: string) => {
			if (organizationId === activeOrganizationId) return;
			setIsSwitching(true);
			try {
				await authClient.organization.setActive({ organizationId });
				await preloadCollections(organizationId);
				await refetchSession();
			} finally {
				setIsSwitching(false);
			}
		},
		[activeOrganizationId, refetchSession],
	);

	const previousOrganizationIdRef = useRef<string | null>(null);
	useEffect(() => {
		preloadActiveOrganizationCollections(activeOrganizationId);
		// Once the active org is current, evict every prior org's local
		// collection set. This effect is the single trigger for all switch
		// paths, including callers that set the active org directly without
		// going through `switchOrganization`.
		if (activeOrganizationId) {
			evictInactiveOrgCollections(activeOrganizationId);
			if (
				previousOrganizationIdRef.current &&
				previousOrganizationIdRef.current !== activeOrganizationId
			) {
				dropCloudQueriesForOrgSwitch();
			}
			previousOrganizationIdRef.current = activeOrganizationId;
		}
	}, [activeOrganizationId]);

	const collections = useMemo(
		() => (activeOrganizationId ? getCollections(activeOrganizationId) : null),
		[activeOrganizationId],
	);

	const contextValue = useMemo<CollectionsContextType | null>(
		() => (collections ? { ...collections, switchOrganization } : null),
		[collections, switchOrganization],
	);

	if (!contextValue || isSwitching) {
		return null;
	}

	return (
		<CollectionsContext.Provider value={contextValue}>
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
