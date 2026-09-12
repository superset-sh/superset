/** What `pullRequests.getLinkedWorkspace` answers. */
export interface LinkedWorkspace {
	workspaceId: string | null;
}

interface ResolveLinkedWorkspaceIdArgs {
	/** The cached or freshly queried link, `undefined` before it answers. */
	workspaceId: string | null | undefined;
	/**
	 * Ids of every live workspace on this pull request's host, or `null` when
	 * the mirror holds no evidence about that host at all. Archived
	 * workspaces leave the mirror but keep their row, so absence from a set
	 * the host actually answered is what marks an id as no longer usable.
	 */
	liveWorkspaceIds: ReadonlySet<string> | null;
}

interface LiveWorkspaceIdsForHostArgs {
	/** The host this pull request is read from, `null` before it resolves. */
	hostId: string | null;
	workspaces: readonly { id: string; hostId: string }[];
	/** `useHostWorkspaces().answeredHostIds`. */
	answeredHostIds: ReadonlySet<string>;
}

/**
 * The live workspaces `hostId` reported, or `null` when it reported nothing.
 *
 * The mirror merges every host into one list, and a host that errored, is
 * still loading, or is rendering an offline snapshot contributes no rows to
 * it. Reading that silence as "the workspace is gone" would throw away an id
 * this tab's own create just wrote and check the pull request out a second
 * time — so only a host that answered gets to speak about its workspaces.
 * The answer may legitimately be an empty set: a user who deleted their last
 * workspace has proven the id gone.
 */
export function liveWorkspaceIdsForHost({
	hostId,
	workspaces,
	answeredHostIds,
}: LiveWorkspaceIdsForHostArgs): ReadonlySet<string> | null {
	if (!hostId || !answeredHostIds.has(hostId)) return null;
	return new Set(
		workspaces
			.filter((workspace) => workspace.hostId === hostId)
			.map((workspace) => workspace.id),
	);
}

/**
 * The workspace a PR comment should be sent into, or `null` to create one.
 *
 * The tab seeds this query with the workspace a failed agent launch left
 * behind, which is how a retry avoids checking the PR out twice. That seed
 * outlives the workspace being deleted: deletion archives the row rather than
 * removing it, and `agents.run` looks a workspace up by id without checking
 * `archivedAt`, so sending into an archived id reports "Sent to agent" into a
 * workspace the user deleted. Drop the id once the host has answered without
 * it — never on silence, which would create the second checkout this seed
 * exists to prevent.
 */
export function resolveLinkedWorkspaceId({
	workspaceId,
	liveWorkspaceIds,
}: ResolveLinkedWorkspaceIdArgs): string | null {
	if (!workspaceId) return null;
	if (liveWorkspaceIds === null) return workspaceId;
	return liveWorkspaceIds.has(workspaceId) ? workspaceId : null;
}
