import { useEffect, useRef, useState } from "react";

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
	/** No host has resolved to a reachable URL yet — nobody to ask. */
	hasLiveTargets: boolean;
}

/** Pure gate: whether a fresh resolution attempt should start. */
export function shouldStartResolution(
	input: MissVerdictInput,
	attemptedId: string | null,
): boolean {
	return (
		input.workspaceId !== null &&
		!input.workspaceFound &&
		!input.suspended &&
		input.hasLiveTargets &&
		attemptedId !== input.workspaceId
	);
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
 * independent of `isReady`, which one hanging host can hold false for minutes.
 */
export function useWorkspaceMissVerdict(
	input: MissVerdictInput,
	refetchAll: () => Promise<void>,
	capMs: number = DEFAULT_CAP_MS,
): boolean {
	const { workspaceId, workspaceFound, suspended, hasLiveTargets } = input;
	const [missedId, setMissedId] = useState<string | null>(null);
	const attemptedIdRef = useRef<string | null>(null);

	useEffect(() => {
		if (
			workspaceId === null ||
			!shouldStartResolution(
				{ workspaceId, workspaceFound, suspended, hasLiveTargets },
				attemptedIdRef.current,
			)
		) {
			return;
		}
		const attemptId = workspaceId;
		attemptedIdRef.current = attemptId;
		void runVerdictWindow(refetchAll, capMs).then(() => {
			setMissedId((prev) => (prev === attemptId ? prev : attemptId));
		});
		// Deliberately no cleanup: cache-identity churn re-runs this effect
		// mid-window, and cancelling the window then would strand the route on
		// the loading shell. A late verdict for a stale id is inert — the
		// return value compares against the current workspaceId.
	}, [
		workspaceId,
		workspaceFound,
		suspended,
		hasLiveTargets,
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
