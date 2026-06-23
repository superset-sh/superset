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
import { electronTrpc } from "renderer/lib/electron-trpc";
import { electronTrpcClient } from "renderer/lib/trpc-client";
import { MOCK_ORG_ID } from "shared/constants";
import {
	getCollections,
	preloadCollections,
	setCurrentOrgId,
} from "./collections";

type CollectionsContextType = ReturnType<typeof getCollections> & {
	activeOrganizationId: string;
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
	const { data: session } = authClient.useSession();
	const [isSwitching, setIsSwitching] = useState(false);

	// Per-window active org. The window registry (main process) is the source of
	// truth: each window holds its own org, so switching in one window never
	// affects another. For a window that has no org yet (the first window of an
	// existing user), seed from the shared login session's active org and persist
	// that seed back into the registry.
	const { data: windowOrgId, isPending: windowOrgPending } =
		electronTrpc.window.getActiveOrg.useQuery();

	const sessionOrgId = env.SKIP_ENV_VALIDATION
		? MOCK_ORG_ID
		: session?.session?.activeOrganizationId;

	const [activeOrganizationId, setActiveOrganizationId] = useState<
		string | null
	>(null);

	// Resolve the effective org once the window query settles. setCurrentOrgId
	// keeps outgoing cloud API calls scoped to this window's org.
	useEffect(() => {
		if (windowOrgPending) return;
		const resolved = windowOrgId ?? sessionOrgId ?? null;
		setCurrentOrgId(resolved);
		setActiveOrganizationId(resolved);
		if (!windowOrgId && resolved) {
			void electronTrpcClient.window.setActiveOrg
				.mutate({ organizationId: resolved })
				.catch((error) => {
					console.error(
						"[collections-provider] Failed to persist seeded org:",
						error,
					);
				});
		}
	}, [windowOrgPending, windowOrgId, sessionOrgId]);

	const switchOrganization = useCallback(
		async (organizationId: string) => {
			if (organizationId === activeOrganizationId) return;
			setIsSwitching(true);
			try {
				// Window-local switch: scope this window's API calls and registry
				// entry to the new org, then warm its collections. The shared login
				// session is intentionally NOT mutated, so other windows are unaffected.
				setCurrentOrgId(organizationId);
				await electronTrpcClient.window.setActiveOrg.mutate({ organizationId });
				await preloadCollections(organizationId);
				setActiveOrganizationId(organizationId);
			} finally {
				setIsSwitching(false);
			}
		},
		[activeOrganizationId],
	);

	useEffect(() => {
		preloadActiveOrganizationCollections(activeOrganizationId);
	}, [activeOrganizationId]);

	const collections = useMemo(
		() => (activeOrganizationId ? getCollections(activeOrganizationId) : null),
		[activeOrganizationId],
	);

	const contextValue = useMemo<CollectionsContextType | null>(
		() =>
			collections && activeOrganizationId
				? { ...collections, activeOrganizationId, switchOrganization }
				: null,
		[collections, activeOrganizationId, switchOrganization],
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
