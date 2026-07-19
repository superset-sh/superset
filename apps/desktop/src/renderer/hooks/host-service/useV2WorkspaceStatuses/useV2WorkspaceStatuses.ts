import { useQueries } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { useHostWorkspaces } from "renderer/routes/_authenticated/providers/HostWorkspacesProvider";
import { useV2NotificationStore } from "renderer/stores/v2-notifications";
import {
	type ActivePaneStatus,
	getHighestPriorityStatus,
	type PaneStatus,
} from "shared/tabs-types";
import {
	fetchTerminalAgentBindings,
	getTerminalAgentBindingsQueryKey,
	type TerminalAgentBinding,
} from "../useTerminalAgentBindings";
import { deriveTerminalAgentStatus } from "../useTerminalAgentStatuses/deriveTerminalAgentStatus";

/**
 * Poll interval for the bulk source. Mounted sidebar rows still invalidate
 * their (shared-key) binding query instantly on `agent:lifecycle` events, and
 * this hook observes the same cache entries — so visible workspaces update
 * immediately. This interval only bounds staleness for workspaces whose row is
 * unmounted (e.g. inside a collapsed status bucket), which the per-row event
 * subscription never covers. A dedicated bulk lifecycle subscription (for
 * instant updates on unmounted rows too) is a follow-up; see the plan step 2.
 */
const BULK_STATUS_REFETCH_INTERVAL_MS = 5_000;

/**
 * A finished agent stays in the Waiting bucket while it's recent, then ages into
 * Idle once it's been quiet this long. This is the only path a stopped agent
 * takes to Idle: clicking a row never demotes it (not seen-gated), only elapsed
 * time with no new agent activity does. Keyed off the agent's own last-event
 * time, so it's unaffected by mere viewing. ~a day ≈ "still my move today,
 * parked after that"; tune here.
 */
const WAITING_TO_IDLE_AFTER_MS = 24 * 60 * 60 * 1_000;

export type WorkspaceStatusMap = Map<string, ActivePaneStatus | null>;

function getStatusMapFingerprint(map: WorkspaceStatusMap): string {
	return JSON.stringify(
		[...map.entries()].sort(([a], [b]) => a.localeCompare(b)),
	);
}

/**
 * Bulk `workspaceId → ActivePaneStatus | null` for status-grouped sidebar
 * buckets. Independent of what rows are rendered: it mounts the binding query
 * for every requested id itself (reusing the exact per-row query key/fetcher so
 * both share React Query cache and can never disagree), so a workspace inside a
 * collapsed bucket is still classified correctly instead of being stuck as Idle.
 *
 * `null` means "no active agent" (idle, or status not yet resolved) — callers
 * fall through to PR lifecycle for such workspaces; only `working`/`permission`
 * pull a workspace into the Working bucket, so an unresolved status never
 * wrongly reads as Working.
 *
 * Unlike the per-row indicator, this is deliberately **not seen-gated**: a
 * finished agent resolves to `review` whether or not you've clicked/seen the
 * row. Bucketing reflects the *state of the work* ("agent finished — your
 * move"), not an unread badge, so opening a workspace clears its green dot (a
 * per-row concern) without dropping it out of the Waiting bucket into Idle.
 *
 * A stopped agent still reaches Idle, but by **time, not viewing**: once it's
 * been quiet longer than `WAITING_TO_IDLE_AFTER_MS` it ages out of Waiting. So
 * Idle means "no agent activity, or the agent finished long enough ago that
 * you've clearly moved on" (and no PR).
 */
export function useV2WorkspaceStatuses(
	workspaceIds: string[],
	options?: { enabled?: boolean },
): WorkspaceStatusMap {
	const enabled = options?.enabled ?? true;
	const { workspaces, cache } = useHostWorkspaces();
	const { resolveHostUrl } = cache;
	const manualUnread = useV2NotificationStore((state) => state.manualUnread);

	const workspacesById = useMemo(
		() => new Map(workspaces.map((workspace) => [workspace.id, workspace])),
		[workspaces],
	);

	// Resolve (workspaceId, hostUrl) targets. Workspaces on an unreachable host
	// (null url) or not present in the collection are skipped — they still get
	// their manual-unread mark applied below.
	const targets = useMemo(
		() =>
			workspaceIds.flatMap((workspaceId) => {
				const workspace = workspacesById.get(workspaceId);
				if (!workspace) return [];
				const hostUrl = resolveHostUrl(workspace.hostId);
				if (!hostUrl) return [];
				return [{ workspaceId, hostUrl }];
			}),
		[workspaceIds, workspacesById, resolveHostUrl],
	);

	const results = useQueries({
		queries: targets.map((target) => ({
			queryKey: getTerminalAgentBindingsQueryKey(
				target.hostUrl,
				target.workspaceId,
			),
			enabled,
			refetchInterval: BULK_STATUS_REFETCH_INTERVAL_MS,
			staleTime: 30_000,
			queryFn: () =>
				fetchTerminalAgentBindings(target.hostUrl, target.workspaceId),
		})),
	});

	const bindingsByWorkspaceId = useMemo(() => {
		const map = new Map<string, TerminalAgentBinding[]>();
		targets.forEach((target, index) => {
			const data = results[index]?.data;
			if (data) map.set(target.workspaceId, data);
		});
		return map;
		// results is a fresh array each render; the fingerprint layer below
		// stabilizes the final output so groups only rebuild on real changes.
	}, [targets, results]);

	// Waiting→Idle is a time boundary, not a data change. `Date.now()` only
	// advances this on re-render, and a poll that returns identical bindings
	// won't re-render — so a quiet Waiting workspace could linger past its window
	// until some unrelated update. Drive the cutoff off a clock we bump with an
	// explicit timer at the next expiry instead. `nextExpiryAt` is a primitive,
	// so the timer only reschedules when the earliest expiry actually changes
	// (`bindingsByWorkspaceId` is a fresh reference every render). Initialised to
	// mount time, so anything already past its window ages immediately.
	const [now, setNow] = useState(() => Date.now());
	const nextExpiryAt = useMemo(() => {
		let next = Number.POSITIVE_INFINITY;
		for (const bindings of bindingsByWorkspaceId.values()) {
			for (const binding of bindings) {
				const expiry = binding.lastEventAt + WAITING_TO_IDLE_AFTER_MS;
				if (expiry > now && expiry < next) next = expiry;
			}
		}
		return Number.isFinite(next) ? next : null;
	}, [bindingsByWorkspaceId, now]);
	useEffect(() => {
		if (nextExpiryAt == null) return;
		const timer = setTimeout(
			() => setNow(Date.now()),
			Math.max(0, nextExpiryAt - Date.now()),
		);
		return () => clearTimeout(timer);
	}, [nextExpiryAt]);

	const previousRef = useRef<{
		fingerprint: string;
		map: WorkspaceStatusMap;
	} | null>(null);

	return useMemo(() => {
		const map: WorkspaceStatusMap = new Map();
		// Anything the agent last touched before this cutoff has aged out of
		// Waiting into Idle. Keyed off `now`, which the expiry timer above bumps,
		// so the transition fires deterministically at the window boundary.
		const agingCutoff = now - WAITING_TO_IDLE_AFTER_MS;
		for (const workspaceId of workspaceIds) {
			const statuses: (PaneStatus | undefined)[] = [
				manualUnread[workspaceId] ? "review" : undefined,
			];
			for (const binding of bindingsByWorkspaceId.get(workspaceId) ?? []) {
				const status = deriveTerminalAgentStatus({
					lastEventType: binding.lastEventType,
					lastEventAt: binding.lastEventAt,
					// Not seen-gated: clicking a row must not demote it. The per-row
					// seen-gated variant lives in useTerminalAgentStatuses.
					lastSeenAt: undefined,
				});
				// A finished (review) agent stays Waiting only while recent; once it's
				// been quiet past the window it ages to idle. This is the sole path a
				// stopped agent takes to Idle.
				statuses.push(
					status === "review" && binding.lastEventAt < agingCutoff
						? "idle"
						: status,
				);
			}
			map.set(workspaceId, getHighestPriorityStatus(statuses));
		}

		const fingerprint = getStatusMapFingerprint(map);
		if (previousRef.current?.fingerprint === fingerprint) {
			return previousRef.current.map;
		}
		previousRef.current = { fingerprint, map };
		return map;
	}, [workspaceIds, bindingsByWorkspaceId, manualUnread, now]);
}
