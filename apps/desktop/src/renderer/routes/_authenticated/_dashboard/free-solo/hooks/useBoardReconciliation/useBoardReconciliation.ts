import { useEffect } from "react";
import type { HostWorkspaceItem } from "renderer/hooks/host-workspaces/useHostWorkspaces";
import { useHostWorkspaces } from "renderer/routes/_authenticated/providers/HostWorkspacesProvider";
import {
	type BoardCard,
	type CardMissingReason,
	useFreeSoloBoardStore,
} from "renderer/stores/free-solo-board";

interface ComputeMissingCardsInput {
	/** Gate, not data: false means "the org's host list itself hasn't
	 *  resolved yet" — too early to trust any absence as evidence. */
	hostsSettled: boolean;
	/** True once every reachable host's workspace query has actually
	 *  settled (success, error, or a cached snapshot) — see
	 *  useHostWorkspaces. Stronger than hostsSettled, which only means the
	 *  org's host *list* resolved: a host that's unreachable AND has no
	 *  cached snapshot (fresh install, newly-added host, cleared IndexedDB)
	 *  contributes zero rows, so it leaves no `hostReachable: false` marker
	 *  for anyHostUnreachable to see either. The "workspace" verdict needs
	 *  this as its positive evidence; the "terminal" verdict doesn't — it
	 *  already gates per-host on sessionsByHost. */
	isReady: boolean;
	cards: readonly BoardCard[];
	workspaces: readonly HostWorkspaceItem[];
	/** Live terminal ids per host URL. A host absent from this map has not
	 *  answered yet — silence is not evidence its sessions are gone. */
	sessionsByHost: Record<string, ReadonlySet<string>>;
	resolveHostUrl: (hostId: string) => string | null;
}

export interface ReconciliationVerdict {
	/** Cards with positive evidence the thing they point at is gone. */
	missing: Record<string, CardMissingReason>;
	/** Cards still carrying `createOnAttach` whose session their own host has
	 *  now listed. The flag exempts a card from the "terminal" verdict, so it
	 *  has to expire the moment the session it was waiting for exists —
	 *  otherwise a card added via "New terminal in…" is exempt forever. */
	started: string[];
}

/**
 * Pure decision core of reconciliation, split out so "silence is never
 * death" is checkable without mounting React or a store.
 *
 * Returns `null` — not an empty verdict — when hosts haven't settled. That
 * distinction matters: the caller must skip calling `setMissing` entirely in
 * that case, not call it with an empty map, or a transient not-settled render
 * would clear missing flags a previous, settled pass had already earned.
 */
export function computeMissingCards({
	hostsSettled,
	isReady,
	cards,
	workspaces,
	sessionsByHost,
	resolveHostUrl,
}: ComputeMissingCardsInput): ReconciliationVerdict | null {
	// An early read is incomplete; reconciling against it would flash the
	// dead tile on every card at boot.
	if (!hostsSettled) return null;

	const workspaceById = new Map(
		workspaces.map((workspace) => [workspace.id, workspace]),
	);
	const missing: Record<string, CardMissingReason> = {};
	const started: string[] = [];

	for (const card of cards) {
		const workspace = workspaceById.get(card.workspaceId);
		if (!workspace) {
			// The workspace is absent from the merged list. isReady is the
			// positive evidence that means: an unreachable host with no cached
			// snapshot contributes neither a row nor a hostReachable:false
			// marker, so anyHostUnreachable alone can't tell "gone" from
			// "never asked" — only isReady can.
			if (!isReady) continue;
			const anyHostUnreachable = workspaces.some(
				(item) => item.hostReachable === false,
			);
			if (!anyHostUnreachable) missing[card.id] = "workspace";
			continue;
		}
		const hostUrl = resolveHostUrl(workspace.hostId);
		// No URL, or that host hasn't reported yet → no verdict this pass.
		if (!hostUrl) continue;
		const liveOnHost = sessionsByHost[hostUrl];
		if (!liveOnHost) continue;
		const isLive = liveOnHost.has(card.terminalId);

		// Added as "new terminal": no session exists until its socket makes
		// one, so absence is expected rather than death — but only until the
		// card's OWN host lists it. That first sighting retires the exemption;
		// after it, the card is reconciled like any other.
		if (card.createOnAttach) {
			if (isLive) started.push(card.id);
			continue;
		}
		if (!isLive) missing[card.id] = "terminal";
	}

	return { missing, started };
}

/**
 * Cards outlive the things they point at: a workspace can be deleted from the
 * CLI or another machine, a terminal closed in its own pane. Mark those cards
 * instead of dropping them — a card the user placed shouldn't vanish on its
 * own, least of all because a host was briefly slow.
 */
export function useBoardReconciliation(
	/** Live terminal ids per host URL. A host absent from this map has not
	 *  answered yet — silence is not evidence its sessions are gone. */
	sessionsByHost: Record<string, ReadonlySet<string>>,
) {
	const { workspaces, hostsSettled, isReady, cache } = useHostWorkspaces();
	const cards = useFreeSoloBoardStore((state) => state.cards);
	const setMissing = useFreeSoloBoardStore((state) => state.setMissing);
	const clearCreateOnAttach = useFreeSoloBoardStore(
		(state) => state.clearCreateOnAttach,
	);

	useEffect(() => {
		const verdict = computeMissingCards({
			hostsSettled,
			isReady,
			cards,
			workspaces,
			sessionsByHost,
			resolveHostUrl: cache.resolveHostUrl,
		});
		if (!verdict) return;
		// Retire expired exemptions before the verdict lands, so a card
		// confirmed live this pass is reconciled normally from the next one.
		// Both actions return state unchanged when nothing moved, which is what
		// keeps this effect — `cards` is one of its dependencies — from
		// re-triggering itself.
		clearCreateOnAttach(verdict.started);
		setMissing(verdict.missing);
	}, [
		cards,
		workspaces,
		hostsSettled,
		isReady,
		sessionsByHost,
		cache,
		setMissing,
		clearCreateOnAttach,
	]);
}
