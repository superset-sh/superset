import { useEffect, useState } from "react";

const DEFAULT_CAP_MS = 5_000;
/** How long an unanswered verdict waits before asking the hosts again. */
const UNANSWERED_RETRY_MS = 5_000;

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
	/**
	 * The local host-service has no port: starting, crashed and respawning, or
	 * given up. Its workspaces are unreadable for the duration, so a miss
	 * proves nothing — the route shows the service's own pending state, which
	 * says what is actually wrong and offers a restart. Judging here is how a
	 * host-service crash loop read as "Workspace not found".
	 */
	localHostDown: boolean;
}

export type MissVerdictAction = "none" | "open-window";

/**
 * "missing": a host answered the post-request refetch and the row was not in
 * it. "unanswered": the window closed without any host answering (wedged or
 * unreachable) — absence unproven. null: not judged.
 */
export type MissVerdict = "missing" | "unanswered" | null;

/** Pure decision: whether a verdict pass should open a refetch window. */
export function planVerdictAction(input: MissVerdictInput): MissVerdictAction {
	if (!input.workspaceId || input.workspaceFound || input.suspended) {
		return "none";
	}
	if (!input.hostsEnumerated || input.localHostDown) {
		return "none";
	}
	return "open-window";
}

/**
 * Wait for one post-request refetch to settle, bounded by the cap so a
 * hanging host can't hold the route on the loading shell forever. Resolves to
 * whether any host answered: false on the cap, on rejection, or when every
 * host errored — settlement without an answer is not evidence.
 */
export function runVerdictWindow(
	refetchAll: () => Promise<boolean>,
	capMs: number,
	schedule: (fn: () => void, ms: number) => () => void = scheduleTimeout,
): Promise<boolean> {
	return new Promise((resolve) => {
		let settled = false;
		let cancelCap = () => {};
		const finish = (answered: boolean) => {
			if (settled) return;
			settled = true;
			cancelCap();
			resolve(answered);
		};
		cancelCap = schedule(() => finish(false), capMs);
		refetchAll().then(finish, () => finish(false));
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
 * host-service instance, stale boot snapshot). Verdict rule: "missing" only
 * after a refetch that started after this route asked was answered by a host
 * without the row — never from pre-existing cache state alone, never while
 * the local host-service is down, and never from a request nobody answered.
 * That last case is "unanswered": the route shows the host as unresponsive
 * and this hook keeps asking on a fixed cadence until a host answers or the
 * row arrives.
 *
 * The window is cancelled whenever the input changes (navigation, row
 * arrival), and the verdict is keyed by id and reset on navigation, so a
 * revisited id always re-verifies and a superseded window can never clobber
 * the current route's verdict.
 */
export function useWorkspaceMissVerdict(
	input: MissVerdictInput,
	refetchAll: () => Promise<boolean>,
	capMs: number = DEFAULT_CAP_MS,
): MissVerdict {
	const {
		workspaceId,
		workspaceFound,
		suspended,
		hostsEnumerated,
		localHostDown,
	} = input;
	const [verdict, setVerdict] = useState<{
		workspaceId: string;
		kind: Exclude<MissVerdict, null>;
	} | null>(null);

	useEffect(() => {
		// A verdict must not outlive navigation: entering a different id drops
		// the previous one so the route re-verifies instead of trusting state
		// from an earlier visit.
		setVerdict((prev) =>
			prev === null || prev.workspaceId === workspaceId ? prev : null,
		);
		const action = planVerdictAction({
			workspaceId,
			workspaceFound,
			suspended,
			hostsEnumerated,
			localHostDown,
		});
		if (action === "none" || workspaceId === null) return;
		let cancelled = false;
		let retry: ReturnType<typeof setTimeout> | null = null;
		const ask = () => {
			void runVerdictWindow(refetchAll, capMs).then((answered) => {
				if (cancelled) return;
				setVerdict({
					workspaceId,
					kind: answered ? "missing" : "unanswered",
				});
				if (!answered) retry = setTimeout(ask, UNANSWERED_RETRY_MS);
			});
		};
		ask();
		return () => {
			cancelled = true;
			if (retry) clearTimeout(retry);
		};
	}, [
		workspaceId,
		workspaceFound,
		suspended,
		hostsEnumerated,
		localHostDown,
		refetchAll,
		capMs,
	]);

	if (
		workspaceId === null ||
		workspaceFound ||
		suspended ||
		verdict?.workspaceId !== workspaceId
	) {
		return null;
	}
	return verdict.kind;
}
