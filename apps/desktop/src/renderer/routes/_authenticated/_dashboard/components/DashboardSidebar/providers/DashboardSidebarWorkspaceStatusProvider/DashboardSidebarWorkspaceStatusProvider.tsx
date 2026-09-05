import { useQueries, useQueryClient } from "@tanstack/react-query";
import {
	createContext,
	type ReactNode,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useRef,
	useState,
	useSyncExternalStore,
} from "react";
import {
	type DiffStats,
	getDiffStatsQueryKey,
	useDiffStats,
} from "renderer/hooks/host-service/useDiffStats";
import {
	getTerminalAgentBindingsQueryKey,
	type TerminalAgentBinding,
} from "renderer/hooks/host-service/useTerminalAgentBindings";
import { deriveTerminalAgentStatus } from "renderer/hooks/host-service/useTerminalAgentStatuses";
import { getHostEventBus } from "renderer/lib/host-event-bus";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { useHostWorkspaces } from "renderer/routes/_authenticated/providers/HostWorkspacesProvider";
import { useV2NotificationStore } from "renderer/stores/v2-notifications";
import {
	type ActivePaneStatus,
	getHighestPriorityStatus,
	type PaneStatus,
} from "shared/tabs-types";

export interface SidebarWorkspaceStatusEntry {
	/** Highest-priority attention status across the workspace's terminals. */
	status: ActivePaneStatus | null;
	/** Manual unread mark, or any terminal in review/failed. */
	isUnread: boolean;
	/** `terminalId → host agent binding` (source rows for mark-seen). */
	bindings: ReadonlyMap<string, TerminalAgentBinding>;
	/** `terminalId → derived agent status` (drives the agents chip). */
	statuses: ReadonlyMap<string, PaneStatus>;
	/** Populated only for the active workspace — the only row that shows it. */
	diffStats: DiffStats | null;
}

const EMPTY_ENTRY: SidebarWorkspaceStatusEntry = {
	status: null,
	isUnread: false,
	bindings: new Map(),
	statuses: new Map(),
	diffStats: null,
};

/**
 * Per-workspace external store: rows subscribe to their own entry via
 * useSyncExternalStore, so a bindings/status change re-renders only the rows
 * whose entry actually changed — not every row on every cache update.
 */
class SidebarWorkspaceStatusStore {
	private entries = new Map<string, SidebarWorkspaceStatusEntry>();
	private listeners = new Map<string, Set<() => void>>();
	private pendingChanged: string[] = [];

	get(workspaceId: string): SidebarWorkspaceStatusEntry {
		return this.entries.get(workspaceId) ?? EMPTY_ENTRY;
	}

	subscribe(workspaceId: string, listener: () => void): () => void {
		let set = this.listeners.get(workspaceId);
		if (!set) {
			set = new Set();
			this.listeners.set(workspaceId, set);
		}
		set.add(listener);
		return () => {
			set.delete(listener);
			if (set.size === 0) this.listeners.delete(workspaceId);
		};
	}

	/**
	 * Swaps the entry map during the provider's render (so children mounting
	 * afterwards read fresh snapshots) and queues change notifications, which
	 * must only fire after commit — see flushNotifications.
	 */
	replaceEntries(next: Map<string, SidebarWorkspaceStatusEntry>): void {
		if (next === this.entries) return;
		for (const [workspaceId, entry] of next) {
			if (this.entries.get(workspaceId) !== entry) {
				this.pendingChanged.push(workspaceId);
			}
		}
		for (const workspaceId of this.entries.keys()) {
			if (!next.has(workspaceId)) this.pendingChanged.push(workspaceId);
		}
		this.entries = next;
	}

	flushNotifications(): void {
		if (this.pendingChanged.length === 0) return;
		const changed = new Set(this.pendingChanged);
		this.pendingChanged = [];
		for (const workspaceId of changed) {
			const set = this.listeners.get(workspaceId);
			if (!set) continue;
			for (const listener of [...set]) listener();
		}
	}
}

const StatusStoreContext = createContext<SidebarWorkspaceStatusStore | null>(
	null,
);

export interface SidebarStatusWorkspaceRef {
	id: string;
	hostId: string;
}

interface WorkspaceStatusTarget {
	workspaceId: string;
	hostUrl: string | null;
}

function mapsShallowEqual<Value>(
	left: ReadonlyMap<string, Value>,
	right: ReadonlyMap<string, Value>,
): boolean {
	if (left.size !== right.size) return false;
	for (const [key, value] of left) {
		if (right.get(key) !== value) return false;
	}
	return true;
}

function entriesEqual(
	left: SidebarWorkspaceStatusEntry,
	right: SidebarWorkspaceStatusEntry,
): boolean {
	return (
		left.status === right.status &&
		left.isUnread === right.isUnread &&
		(left.diffStats === right.diffStats ||
			(left.diffStats !== null &&
				right.diffStats !== null &&
				left.diffStats.additions === right.diffStats.additions &&
				left.diffStats.deletions === right.diffStats.deletions)) &&
		mapsShallowEqual(left.bindings, right.bindings) &&
		mapsShallowEqual(left.statuses, right.statuses)
	);
}

/**
 * Owns the sidebar's terminal-agent-bindings queries and lifecycle-event
 * subscriptions for every visible workspace, replacing the per-row copies
 * (~4 query observers + 2 bus listeners per row). Query keys, fetch shape,
 * and staleTime match useTerminalAgentBindings exactly, so the react-query
 * cache semantics (and consumers like useV2AttentionWorkspaceCount, which
 * aggregates over these keys) are unchanged — this reduces subscription
 * fan-out, not fetches.
 */
export function DashboardSidebarWorkspaceStatusProvider({
	workspaces,
	activeWorkspaceId,
	children,
}: {
	workspaces: SidebarStatusWorkspaceRef[];
	activeWorkspaceId: string | null;
	children: ReactNode;
}) {
	const [store] = useState(() => new SidebarWorkspaceStatusStore());
	const queryClient = useQueryClient();
	const { cache: hostWorkspacesCache } = useHostWorkspaces();

	const computedTargets = useMemo<WorkspaceStatusTarget[]>(
		() =>
			workspaces.map((workspace) => ({
				workspaceId: workspace.id,
				// A sandbox row gets no live subscription from the sidebar: holding
				// a socket to it keeps its VM awake for as long as the app is open,
				// and the sidebar is open all day. Its status goes live when the
				// workspace itself is opened and its own subscribers connect.
				hostUrl: hostWorkspacesCache.isSandboxHost(workspace.hostId)
					? null
					: hostWorkspacesCache.resolveHostUrl(workspace.hostId),
			})),
		[workspaces, hostWorkspacesCache],
	);
	// Fingerprint-stabilized: the host-workspaces cache object churns identity
	// on unrelated updates, and the subscription effect below must only re-run
	// when a workspace or its host URL actually changes.
	const previousTargetsRef = useRef<{
		fingerprint: string;
		targets: WorkspaceStatusTarget[];
	} | null>(null);
	const targets = useMemo(() => {
		const fingerprint = JSON.stringify(computedTargets);
		const previous = previousTargetsRef.current;
		if (previous?.fingerprint === fingerprint) return previous.targets;
		previousTargetsRef.current = { fingerprint, targets: computedTargets };
		return computedTargets;
	}, [computedTargets]);

	const bindingRowsByIndex = useQueries({
		queries: targets.map((target) => ({
			queryKey: getTerminalAgentBindingsQueryKey(target.workspaceId),
			enabled: target.hostUrl !== null,
			queryFn: () => {
				if (!target.hostUrl) return [] as TerminalAgentBinding[];
				return getHostServiceClientByUrl(
					target.hostUrl,
				).terminalAgents.listByWorkspace.query({
					workspaceId: target.workspaceId,
				});
			},
			// Lifecycle events invalidate for instant updates; the finite
			// staleTime lets focus/remount refetches self-heal any staleness
			// from events missed while the WS was down (host restart, sleep).
			staleTime: 30_000,
		})),
		combine: (results) => results.map((result) => result.data),
	});

	// One lifecycle subscription pass for the whole sidebar (the per-row
	// hooks used to register these per workspace, several times over).
	// Listeners are renderer-side only: registering one costs the host
	// nothing, unlike a git watch.
	//
	// Deliberately no git:changed listener and no watchGit here. GitWatcher
	// only watches a workspace while someone holds interest (#6729), and a
	// sidebar row is not that someone: only the active row renders diff
	// stats, and its live updates come from useDiffStats's own subscription
	// below. Holding a watch for every listed row kept most of a heavy
	// user's workspace population under a live .git watch (recursive fs
	// watch + git fan-out on every change) for as long as the dashboard was
	// open. Inactive rows' cached counts are refreshed on activation
	// instead (see the effect after this one).
	useEffect(() => {
		const cleanups: Array<() => void> = [];
		const retainedHostUrls = new Set<string>();
		for (const { workspaceId, hostUrl } of targets) {
			if (!hostUrl) continue;
			const bus = getHostEventBus(hostUrl);
			if (!retainedHostUrls.has(hostUrl)) {
				retainedHostUrls.add(hostUrl);
				cleanups.push(bus.retain());
			}
			const invalidateBindings = () => {
				void queryClient.invalidateQueries({
					queryKey: getTerminalAgentBindingsQueryKey(workspaceId),
				});
			};
			cleanups.push(bus.on("agent:lifecycle", workspaceId, invalidateBindings));
			cleanups.push(
				bus.on("agent:bindings-changed", workspaceId, invalidateBindings),
			);
			cleanups.push(
				bus.on("terminal:lifecycle", workspaceId, invalidateBindings),
			);
		}

		return () => {
			for (const cleanup of cleanups) cleanup();
		};
	}, [targets, queryClient]);

	// A row that was not being watched may hold diff stats cached from its
	// last activation (staleTime is Infinity, so they never refetch on their
	// own). Mark them stale when the row becomes active so the count shown
	// reflects what happened while nobody was watching. A row with nothing
	// cached is fetching for the first time anyway; invalidating it too would
	// only restart that fetch.
	const activeHostUrl =
		targets.find((target) => target.workspaceId === activeWorkspaceId)
			?.hostUrl ?? null;
	useEffect(() => {
		if (!activeWorkspaceId || !activeHostUrl) return;
		const queryKey = getDiffStatsQueryKey(activeHostUrl, activeWorkspaceId);
		if (queryClient.getQueryState(queryKey)?.status !== "success") return;
		void queryClient.invalidateQueries({ queryKey });
	}, [activeWorkspaceId, activeHostUrl, queryClient]);

	// Only the active row renders diff stats, so one query serves the sidebar.
	const activeDiffStats = useDiffStats(activeWorkspaceId ?? "", {
		enabled: activeWorkspaceId !== null,
	});

	const manualUnread = useV2NotificationStore((state) => state.manualUnread);
	const terminalSeenAt = useV2NotificationStore(
		(state) => state.terminalSeenAt,
	);

	const previousEntriesRef = useRef(
		new Map<string, SidebarWorkspaceStatusEntry>(),
	);
	const entries = useMemo(() => {
		const previous = previousEntriesRef.current;
		const next = new Map<string, SidebarWorkspaceStatusEntry>();
		targets.forEach((target, index) => {
			const bindingRows = bindingRowsByIndex[index] ?? [];
			const bindings = new Map<string, TerminalAgentBinding>();
			const statuses = new Map<string, PaneStatus>();
			for (const binding of bindingRows) {
				bindings.set(binding.terminalId, binding);
				statuses.set(
					binding.terminalId,
					deriveTerminalAgentStatus({
						lastEventType: binding.lastEventType,
						lastEventAt: binding.lastEventAt,
						lastSeenAt: terminalSeenAt[binding.terminalId],
					}),
				);
			}
			const hasManualUnread = Boolean(manualUnread[target.workspaceId]);
			let hasAttentionTerminal = false;
			for (const status of statuses.values()) {
				if (status === "review" || status === "failed") {
					hasAttentionTerminal = true;
					break;
				}
			}
			const candidate: SidebarWorkspaceStatusEntry = {
				status: getHighestPriorityStatus([
					hasManualUnread ? "review" : undefined,
					...statuses.values(),
				]),
				isUnread: hasManualUnread || hasAttentionTerminal,
				bindings,
				statuses,
				diffStats:
					target.workspaceId === activeWorkspaceId ? activeDiffStats : null,
			};
			const previousEntry = previous.get(target.workspaceId);
			next.set(
				target.workspaceId,
				previousEntry && entriesEqual(previousEntry, candidate)
					? previousEntry
					: candidate,
			);
		});
		previousEntriesRef.current = next;
		return next;
	}, [
		targets,
		bindingRowsByIndex,
		manualUnread,
		terminalSeenAt,
		activeWorkspaceId,
		activeDiffStats,
	]);

	store.replaceEntries(entries);
	useEffect(() => {
		store.flushNotifications();
	});

	return (
		<StatusStoreContext.Provider value={store}>
			{children}
		</StatusStoreContext.Provider>
	);
}

function useSidebarWorkspaceStatusStore(): SidebarWorkspaceStatusStore {
	const store = useContext(StatusStoreContext);
	if (!store) {
		throw new Error(
			"useSidebarWorkspaceStatus must be used inside DashboardSidebarWorkspaceStatusProvider",
		);
	}
	return store;
}

/**
 * A row's status entry. Re-renders the caller only when this workspace's
 * entry changes; the entry object is referentially stable otherwise.
 */
export function useSidebarWorkspaceStatus(
	workspaceId: string,
): SidebarWorkspaceStatusEntry {
	const store = useSidebarWorkspaceStatusStore();
	return useSyncExternalStore(
		useCallback(
			(listener) => store.subscribe(workspaceId, listener),
			[store, workspaceId],
		),
		useCallback(() => store.get(workspaceId), [store, workspaceId]),
	);
}

/**
 * Marks every terminal with a live agent binding in the workspace as seen,
 * clearing derived `review` statuses. Reads bindings from the store at call
 * time, so callers don't subscribe to binding updates just to hold this.
 */
export function useMarkSidebarWorkspaceTerminalsSeen(
	workspaceId: string,
): () => void {
	const store = useSidebarWorkspaceStatusStore();
	const markTerminalSeen = useV2NotificationStore(
		(state) => state.markTerminalSeen,
	);
	return useCallback(() => {
		// Host-clock only: "seen through the binding's last event".
		for (const binding of store.get(workspaceId).bindings.values()) {
			markTerminalSeen(binding.terminalId, binding.lastEventAt);
		}
	}, [store, workspaceId, markTerminalSeen]);
}
