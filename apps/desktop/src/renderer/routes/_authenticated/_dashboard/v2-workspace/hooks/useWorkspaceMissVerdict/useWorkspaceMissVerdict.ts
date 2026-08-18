import { useEffect, useState } from "react";

const DEFAULT_CAP_MS = 5_000;

export interface MissVerdictInput {
	workspaceId: string | null;
	/** The row is already in the mirror — nothing to resolve. */
	workspaceFound: boolean;
	/**
	 * A create transaction or failed-create entry owns this id; those render
	 * their own states and must never be judged missing.
	 */
	suspended: boolean;
	/**
	 * The org's host list is trustworthy (useKnownHosts settled). Before this,
	 * targets cover only the local host, so a refetch that misses proves
	 * nothing about workspaces on not-yet-enumerated remote hosts — judging
	 * then would flash not-found right after boot or an org switch.
	 */
	hostsEnumerated: boolean;
	/** At least one host resolved to a reachable URL. */
	hasLiveTargets: boolean;
	/**
	 * Every host answered, errored, or served a snapshot
	 * (useHostWorkspaces.isReady). With no live targets AND a settled mirror,
	 * absence is already authoritative (offline with snapshots); before
	 * settlement it means boot — keep waiting.
	 */
	mirrorSettled: boolean;
}

export type MissVerdictAction = "none" | "immediate-miss" | "open-window";

/** Pure decision: what a verdict pass should do for the current input. */
export function planVerdictAction(input: MissVerdictInput): MissVerdictAction {
	if (!input.workspaceId || input.workspaceFound || input.suspended) {
		return "none";
	}
	if (!input.hostsEnumerated) {
		return "none";
	}
	if (!input.hasLiveTargets) {
		return input.mirrorSettled ? "immediate-miss" : "none";
	}
	return "open-window";
}

/**
 * Wait for one post-request refetch to settle, bounded by the cap so a
 * hanging host can't hold the route on the loading shell forever. Resolves on
 * refetch failure too — the verdict needs settlement, not success.
 */
export function runVerdictWindow(
	refetchAll: () => Promise<void>,
	capMs: number,
	schedule: (fn: () => void, ms: number) => () => void = scheduleTimeout,
): Promise<void> {
	return new Promise((resolve) => {
		let settled = false;
		let cancelCap = () => {};
		const finish = () => {
			if (settled) return;
			settled = true;
			cancelCap();
			resolve();
		};
		cancelCap = schedule(finish, capMs);
		refetchAll().then(finish, finish);
	});
}

function scheduleTimeout(fn: () => void, ms: number): () => void {
	const timer = setTimeout(fn, ms);
	return () => clearTimeout(timer);
}

/**
 * Decides when a routed-to workspace id may be declared missing. The mirror
 * (useHostWorkspaces) converges through fire-and-forget events plus a slow
 * fallback refetch, so "not in the mirror" proves nothing at route time — a
 * CLI-created workspace can trail its own deep link (missed broadcast, second
 * host-service instance, stale boot snapshot). Verdict rule: not-found only
 * after a refetch that started after this route asked has settled without the
 * row (or the cap expired) — never from pre-existing cache state alone, and
 * independent of `isReady`'s blank-shell hold (one hanging host can pin that
 * false for minutes).
 *
 * The window is cancelled whenever the input changes (navigation, row
 * arrival), and the verdict is keyed by id and reset on navigation, so a
 * revisited id always re-verifies and a superseded window can never clobber
 * the current route's verdict.
 */
export function useWorkspaceMissVerdict(
	input: MissVerdictInput,
	refetchAll: () => Promise<void>,
	capMs: number = DEFAULT_CAP_MS,
): boolean {
	const {
		workspaceId,
		workspaceFound,
		suspended,
		hostsEnumerated,
		hasLiveTargets,
		mirrorSettled,
	} = input;
	/** The workspaceId whose miss was confirmed by a completed window. */
	const [missedId, setMissedId] = useState<string | null>(null);

	useEffect(() => {
		// A verdict must not outlive navigation: entering a different id drops
		// the previous one so the route re-verifies instead of trusting state
		// from an earlier visit.
		setMissedId((prev) =>
			prev === null || prev === workspaceId ? prev : null,
		);
		const action = planVerdictAction({
			workspaceId,
			workspaceFound,
			suspended,
			hostsEnumerated,
			hasLiveTargets,
			mirrorSettled,
		});
		if (action === "none" || workspaceId === null) return;
		if (action === "immediate-miss") {
			setMissedId(workspaceId);
			return;
		}
		let cancelled = false;
		void runVerdictWindow(refetchAll, capMs).then(() => {
			if (cancelled) return;
			setMissedId(workspaceId);
		});
		return () => {
			cancelled = true;
		};
	}, [
		workspaceId,
		workspaceFound,
		suspended,
		hostsEnumerated,
		hasLiveTargets,
		mirrorSettled,
		refetchAll,
		capMs,
	]);

	return (
		workspaceId !== null &&
		!workspaceFound &&
		!suspended &&
		missedId === workspaceId
	);
}
