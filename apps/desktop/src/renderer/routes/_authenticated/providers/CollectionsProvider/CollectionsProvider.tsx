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
import { electronTrpc } from "renderer/lib/electron-trpc";
import { electronTrpcClient } from "renderer/lib/trpc-client";
import { MOCK_ORG_ID } from "shared/constants";
import {
	evictInactiveOrgCollections,
	getCollections,
	preloadCollections,
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

	// Initialize the window's org exactly once. After this, the window's org is
	// owned by local state (and switchOrganization); later — possibly transient —
	// reads of the registry never override it. This prevents an empty/transient
	// `getActiveOrg` read from snapping the window back to the shared session's
	// default org. Seed the registry from the session only when the window has no
	// org yet (the first window of an existing user).
	const initializedRef = useRef(false);
	useEffect(() => {
		if (initializedRef.current) return;
		if (windowOrgPending) return;
		const resolved = windowOrgId ?? sessionOrgId ?? null;
		if (!resolved) return;
		initializedRef.current = true;
		setActiveOrganizationId(resolved);
	}, [windowOrgPending, windowOrgId, sessionOrgId]);

	// Keep the main-process window registry in sync with this window's active
	// org. Declarative and idempotent: re-asserted whenever the org changes, so
	// the registry (which backs the window title, restore-on-relaunch, and
	// openNew) always reflects the displayed org. This replaces a one-shot,
	// fire-and-forget seed — a transient IPC failure self-corrects on the next
	// change or next launch rather than leaving the registry permanently stale.
	useEffect(() => {
		if (!activeOrganizationId) return;
		void electronTrpcClient.window.setActiveOrg
			.mutate({ organizationId: activeOrganizationId })
			.catch((error) => {
				console.error(
					"[collections-provider] Failed to sync window org to registry:",
					error,
				);
			});
	}, [activeOrganizationId]);

	const switchOrganization = useCallback(
		async (organizationId: string) => {
			if (organizationId === activeOrganizationId) return;
			setIsSwitching(true);
			try {
				// Window-local switch: warm the new org's collections, then flip the
				// UI. The registry is updated by the sync effect above when
				// activeOrganizationId changes. The shared login session is NOT
				// mutated, so other windows are unaffected; each org's collections use
				// their own org-pinned API client. On failure the UI stays put.
				await preloadCollections(organizationId);
				setActiveOrganizationId(organizationId);
			} catch (error) {
				console.error(
					"[collections-provider] Failed to switch organization:",
					error,
				);
			} finally {
				setIsSwitching(false);
			}
		},
		[activeOrganizationId],
	);

	useEffect(() => {
		preloadActiveOrganizationCollections(activeOrganizationId);
		// Once the active org is current (its collections are already cached by the
		// `collections` memo above, which runs during render), evict every prior
		// org's set to free the synced tables they hold. This effect is the single
		// trigger for all switch paths, including callers that set the active org
		// directly without going through `switchOrganization`.
		if (activeOrganizationId) {
			evictInactiveOrgCollections(activeOrganizationId);
		}
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
