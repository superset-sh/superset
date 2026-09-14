import type { LinkedWorkspace } from "./resolveLinkedWorkspaceId";

/** The link as the tab caches it: the host's answer, or an id it seeded. */
export interface CachedLinkedWorkspace extends LinkedWorkspace {
	/**
	 * The id came from a create in this tab and the host has not confirmed
	 * the link yet. Only a real link from the host replaces a seeded id.
	 */
	seeded?: boolean;
	/**
	 * The host has listed this workspace among its live ones at least once.
	 * Until it has, the workspace's absence from that list means "not there
	 * yet" rather than "deleted" — a create whose host answered with a
	 * different canonical id has no row until the host broadcasts it.
	 */
	listed?: boolean;
}

/**
 * What the linked-workspace cache should hold once the host has answered.
 *
 * The host writes `workspaces.pullRequestId` from its own pull-request sync,
 * behind a GitHub fetch, so it can keep answering `null` about a workspace
 * this tab just created and checked out on the PR. The seeded id survives
 * only the query's staleness window; the refetch after it would take that
 * `null` at face value, send the next comment down the create path, and check
 * the pull request out a second time. So a seeded id outlives a `null`
 * answer and is displaced only by a link the host confirms.
 *
 * That leaves the seed to be retired by proof rather than by silence:
 * `reconcileCachedLinkedWorkspace` below writes the retirement down once the
 * host has listed its live workspaces without an id it had listed before, so
 * a later failed list — which proves nothing — has no seed left to resurrect.
 */
export function mergeLinkedWorkspace(
	cached: CachedLinkedWorkspace | undefined,
	answered: LinkedWorkspace,
): CachedLinkedWorkspace {
	if (answered.workspaceId) return { workspaceId: answered.workspaceId };
	if (cached?.seeded && cached.workspaceId) return cached;
	return { workspaceId: null };
}

interface ReconcileCachedLinkedWorkspaceArgs {
	cached: CachedLinkedWorkspace | undefined;
	/** `liveWorkspaceIdsForHost` — `null` when the host reported nothing. */
	liveWorkspaceIds: ReadonlySet<string> | null;
}

/**
 * The cache write the host's live workspace list calls for, or `null` for none.
 *
 * `resolveLinkedWorkspaceId` drops a deleted id per render and writes nothing
 * back, so the dead id sits in the cache waiting for the evidence against it
 * to disappear: one failed `workspace.list` refetch takes the host out of
 * `answeredHostIds`, the resolve loses its evidence, and the workspace the
 * user deleted comes back. Recording what the list proves is what stops later
 * silence from resurrecting it.
 *
 * A list without the id proves it gone only once the id has been in one. A
 * create the host answers with a different canonical id than the optimistic
 * row has no row until the host broadcasts it, and retiring the id in that
 * window would check the pull request out a second time — the thing the seed
 * exists to prevent.
 */
export function reconcileCachedLinkedWorkspace({
	cached,
	liveWorkspaceIds,
}: ReconcileCachedLinkedWorkspaceArgs): CachedLinkedWorkspace | null {
	const workspaceId = cached?.workspaceId;
	if (!workspaceId || liveWorkspaceIds === null) return null;
	if (liveWorkspaceIds.has(workspaceId)) {
		return cached?.listed ? null : { ...cached, workspaceId, listed: true };
	}
	return cached?.listed ? { workspaceId: null } : null;
}
