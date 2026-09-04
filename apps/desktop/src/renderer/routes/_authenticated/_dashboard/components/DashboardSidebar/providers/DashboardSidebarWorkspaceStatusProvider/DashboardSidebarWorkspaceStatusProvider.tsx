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
	// workspaceId -> hostUrl for whatever's currently git-watched, so the
	// subscription effect below can diff instead of unwatch-then-rewatch
	// everything on every targets change.
	const gitWatchedRef = useRef<Map<string, string>>(new Map());

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

	// Only the active row renders diff stats, so one query serves the sidebar.
	const activeDiffStats = useDiffStats(activeWorkspaceId ?? "", {
		enabled: activeWorkspaceId !== null,
	});

	const manualUnread = useV2NotificationStore((state) => state.manualUnread);
	const terminalSeenAt = useV2NotificationStore(
		(state) => state.terminalSeenAt,
	);

	// Per-target terminal statuses — shared by the git-watch gating below and
	// the entries memo further down, so the two never drift.
	const statusesByIndex = useMemo(
		() =>
			targets.map((_target, index) => {
				const bindingRows = bindingRowsByIndex[index] ?? [];
				const statuses = new Map<string, PaneStatus>();
				for (const binding of bindingRows) {
					statuses.set(
						binding.terminalId,
						deriveTerminalAgentStatus({
							lastEventType: binding.lastEventType,
							lastEventAt: binding.lastEventAt,
							lastSeenAt: terminalSeenAt[binding.terminalId],
						}),
					);
				}
				return statuses;
			}),
		[targets, bindingRowsByIndex, terminalSeenAt],
	);

	// Only workspaces with a currently running/blocked/attention-needing
	// agent (or the active workspace) are worth a live git:changed watch —
	// see #6729/#6848. An idle workspace's diff count can't change without
	// user interaction, so it's fine for it to refresh only when actually
	// opened (useDiffStats' normal query fetch) instead of paying for a live
	// host-side watcher (DB lookup + git subprocess + fs.watch attach) on
	// the chance the user clicks into it next. Non-active rows never render
	// a diff count today anyway (see `entries` below) — losing liveness here
	// only means a first-open loading flash instead of an instant number.
	const computedGitWatchTargets = useMemo(() => {
		const result: Array<{ workspaceId: string; hostUrl: string }> = [];
		targets.forEach((target, index) => {
			if (!target.hostUrl) return;
			const isActive = target.workspaceId === activeWorkspaceId;
			const statuses = statusesByIndex[index];
			// Reuses the same canonical "does this need an attention indicator"
			// predicate the UI itself uses (see the entries memo below), rather
			// than a parallel `!== "idle"` check — so a future PaneStatus value
			// can't silently start (or stop) granting a live watcher without
			// this decision being revisited too.
			const hasActiveTerminal = statuses
				? getHighestPriorityStatus(statuses.values()) !== null
				: false;
			if (isActive || hasActiveTerminal) {
				result.push({
					workspaceId: target.workspaceId,
					hostUrl: target.hostUrl,
				});
			}
		});
		// Sorted so a pure reorder of `workspaces` (no membership change) can't
		// change the fingerprint below and trigger a needless watchGit/
		// unwatchGit diffing pass — the resulting Map is keyed by workspaceId
		// either way, so order was never semantically meaningful here.
		result.sort((a, b) => a.workspaceId.localeCompare(b.workspaceId));
		return result;
	}, [targets, statusesByIndex, activeWorkspaceId]);
	// Fingerprint-stabilized for the same reason `targets` is above: this
	// must only change identity when the watch set actually changes, not on
	// every unrelated bindingRows refetch.
	const previousGitWatchTargetsRef = useRef<{
		fingerprint: string;
		targets: Array<{ workspaceId: string; hostUrl: string }>;
	} | null>(null);
	const gitWatchTargets = useMemo(() => {
		const fingerprint = JSON.stringify(computedGitWatchTargets);
		const previous = previousGitWatchTargetsRef.current;
		if (previous?.fingerprint === fingerprint) return previous.targets;
		previousGitWatchTargetsRef.current = {
			fingerprint,
			targets: computedGitWatchTargets,
		};
		return computedGitWatchTargets;
	}, [computedGitWatchTargets]);

	// One lifecycle/git-listener subscription pass for the whole sidebar
	// (the per-row hooks used to register these per workspace, several
	// times over). Covers every row, not just `gitWatchTargets` — this is
	// what detects a row transitioning into activity in the first place
	// (agent:lifecycle/terminal:lifecycle), and a git:changed listener for a
	// workspace nobody's watching simply never fires. Cheap to tear down
	// and redo every render, unlike the watchGit/unwatchGit calls in the
	// effect below.
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
			cleanups.push(
				bus.on("git:changed", workspaceId, () => {
					void queryClient.invalidateQueries({
						queryKey: getDiffStatsQueryKey(hostUrl, workspaceId),
					});
				}),
			);
		}
		return () => {
			for (const cleanup of cleanups) cleanup();
		};
	}, [targets, queryClient]);

	// GitWatcher only watches a workspace while someone holds interest
	// (#6729) — this call site talks to the bus directly rather than
	// through useWorkspaceEvent, so it must drive watchGit/unwatchGit
	// itself. Diffs against the previous run's watched set: only calls
	// watchGit/unwatchGit for rows that actually entered or left
	// `gitWatchTargets`, since — unlike the listener registrations above —
	// these carry real host-side cost (a DB lookup, a git subprocess, and a
	// live fs.watch attach/teardown). Blindly unwatching then rewatching
	// everything on every change would reintroduce a fan-out storm.
	useEffect(() => {
		const nextGitWatched = new Map(
			gitWatchTargets.map(({ workspaceId, hostUrl }) => [workspaceId, hostUrl]),
		);
		const prevGitWatched = gitWatchedRef.current;
		for (const [workspaceId, hostUrl] of prevGitWatched) {
			if (nextGitWatched.get(workspaceId) !== hostUrl) {
				getHostEventBus(hostUrl).unwatchGit(workspaceId);
			}
		}
		for (const [workspaceId, hostUrl] of nextGitWatched) {
			if (prevGitWatched.get(workspaceId) !== hostUrl) {
				getHostEventBus(hostUrl).watchGit(workspaceId);
			}
		}
		gitWatchedRef.current = nextGitWatched;
	}, [gitWatchTargets]);

	// Release git-watch interest for every currently-watched row on final
	// unmount. Deliberately a separate, dep-less effect: its cleanup only
	// runs once, at unmount, so an intermediate gitWatchTargets change
	// (handled by the diffing above) can't trip this and undo it.
	useEffect(() => {
		return () => {
			for (const [workspaceId, hostUrl] of gitWatchedRef.current) {
				getHostEventBus(hostUrl).unwatchGit(workspaceId);
			}
			gitWatchedRef.current = new Map();
		};
	}, []);

	const previousEntriesRef = useRef(
		new Map<string, SidebarWorkspaceStatusEntry>(),
	);
	const entries = useMemo(() => {
		const previous = previousEntriesRef.current;
		const next = new Map<string, SidebarWorkspaceStatusEntry>();
		targets.forEach((target, index) => {
			const bindingRows = bindingRowsByIndex[index] ?? [];
			const bindings = new Map<string, TerminalAgentBinding>();
			for (const binding of bindingRows) {
				bindings.set(binding.terminalId, binding);
			}
			const statuses = statusesByIndex[index] ?? new Map<string, PaneStatus>();
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
		statusesByIndex,
		manualUnread,
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
