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
import {
	CLOUD_TRPC_ROUTER_ROOTS,
	cloudTrpc,
	setCloudOrganizationId,
} from "renderer/lib/cloud-trpc";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { electronTrpcClient } from "renderer/lib/trpc-client";
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
	// A ref, not state: nothing renders differently while a switch is in
	// flight, it only stops two switches overlapping.
	const switchInFlightRef = useRef(false);
	// Set-active writes are chained rather than fired straight off, because the
	// server keeps whichever one *completes* last. Two quick switches racing
	// could otherwise leave the account remembering the organization you
	// switched away from. Every link ends resolved so one failure cannot stall
	// the rest.
	const recordActiveOrganizationRef = useRef<Promise<void>>(Promise.resolve());

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

	// Account-wide ("the orgs I belong to"), so it is not affected by — and does
	// not depend on — the org header this provider sets.
	const { data: organizations } =
		cloudTrpc.organization.list.useQuery(undefined);

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
		// The registry's org is only preferred while it is still one the user
		// belongs to. Leaving an organization (or having membership revoked
		// elsewhere) leaves a dead id in the registry, and adopting it would pin
		// the window to an org whose every read now fails. Until the membership
		// list has loaded we cannot tell stale from valid, so wait rather than
		// guess — the window is showing nothing yet either way.
		const registryOrgIsStillMine =
			windowOrgId != null &&
			organizations != null &&
			organizations.some((organization) => organization.id === windowOrgId);
		if (windowOrgId != null && organizations == null) return;
		const resolved =
			(registryOrgIsStillMine ? windowOrgId : sessionOrgId) ?? null;
		if (!resolved) return;
		initializedRef.current = true;
		setActiveOrganizationId(resolved);
	}, [windowOrgPending, windowOrgId, sessionOrgId, organizations]);

	// Scope this window's cloud reads to its own org, during render rather than
	// in an effect: children below issue their first queries while this render
	// commits, and an effect would let those go out on the session's org — the
	// other window's data — before correcting itself.
	setCloudOrganizationId(activeOrganizationId);

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
			if (switchInFlightRef.current) return;
			switchInFlightRef.current = true;
			try {
				// Window-local switch: warm the new org's collections, then flip the
				// UI. The registry and the cloud org header follow from
				// activeOrganizationId changing. Windows that are already open are
				// unaffected — they seeded once and own their org from then on. On
				// failure the UI stays put.
				await preloadCollections(organizationId);
				setActiveOrganizationId(organizationId);
				// Record the choice on the server as well. A window that opens with
				// no org of its own seeds from the login session, and a session that
				// is never told about a switch keeps handing out the org the server
				// guessed for it — which is how a window-local-only switcher kept
				// dropping people back into an organization they had already left
				// behind. Every other switch path (create, leave, web, mobile) goes
				// through set-active for the same reason.
				//
				// Best effort and unawaited: this window has already moved, and the
				// only cost of a failure is the seed for the next new window.
				recordActiveOrganizationRef.current =
					recordActiveOrganizationRef.current
						.then(async () => {
							const { error } = await authClient.organization.setActive({
								organizationId,
							});
							if (error) throw error;
						})
						.catch((error) => {
							console.error(
								"[collections-provider] Failed to record the active organization:",
								error,
							);
						});
			} catch (error) {
				console.error(
					"[collections-provider] Failed to switch organization:",
					error,
				);
			} finally {
				switchInFlightRef.current = false;
			}
		},
		[activeOrganizationId],
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
		() =>
			collections && activeOrganizationId
				? { ...collections, activeOrganizationId, switchOrganization }
				: null,
		[collections, activeOrganizationId, switchOrganization],
	);

	// Only a window with no org at all renders nothing. Switching used to
	// return null too, which unmounted the whole authenticated tree for as
	// long as the destination org's collections took to preload — a blank
	// window for minutes on a large org. The context still points at the
	// previous org until the switch resolves, so keeping it mounted shows the
	// org you're leaving rather than a void.
	if (!contextValue) {
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
