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
import { initWorkspacePaneRegistry } from "renderer/lib/workspace-pane-registry";
import { MOCK_ORG_ID } from "shared/constants";
import { getCollections, preloadCollections } from "./collections";

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

	useEffect(() => {
		preloadActiveOrganizationCollections(activeOrganizationId);
	}, [activeOrganizationId]);

	// Wire (or rewire on org switch) the workspace pane registry against
	// the active org's v2WorkspaceLocalState collection synchronously, so
	// callers of getOrCreateWorkspacePaneStore — including the workspace
	// route's `useState(() => ...)` initializer — see an initialized
	// registry before they run.
	//
	// Side effects in `useMemo` are not React-blessed (the docs reserve
	// the right to recompute or discard memo work). The synchrony
	// requirement here can't be satisfied by `useEffect`, which runs
	// after render commits. Mitigation: `initWorkspacePaneRegistry`
	// keys teardown on the `v2WorkspaceLocalState` *instance*, so any
	// recomputation that happens to receive the same collection is a
	// no-op rather than a state-clearing event. The only real teardown
	// is on org switch, when the underlying collection actually changes.
	const collections = useMemo(() => {
		if (!activeOrganizationId) return null;
		const next = getCollections(activeOrganizationId);
		initWorkspacePaneRegistry({
			v2WorkspaceLocalState: next.v2WorkspaceLocalState,
		});
		return next;
	}, [activeOrganizationId]);

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
