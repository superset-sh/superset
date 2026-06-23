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
import { getCollections, preloadCollections } from "./collections";

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
		if (!windowOrgId) {
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
				// Window-local switch: record the org for this window and warm its
				// collections, then flip the UI. The shared login session is NOT
				// mutated, so other windows are unaffected. Each org's collections use
				// their own org-pinned API client, so there is no global header to
				// keep in sync. On failure the UI stays on the current org.
				await electronTrpcClient.window.setActiveOrg.mutate({ organizationId });
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
