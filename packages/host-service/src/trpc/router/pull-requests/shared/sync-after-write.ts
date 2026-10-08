import { eq } from "drizzle-orm";
import { pullRequests } from "../../../../db/schema";
import type { HostServiceContext } from "../../../../types";
import {
	findLinkedWorkspaceIds,
	findPullRequestRows,
	type LinkedPullRequestRow,
	type RepoIdentity,
} from "./linked-workspaces";
import { evictPullRequestContent } from "./pull-request-content-cache";

type PullRequestWrite = "merge" | "close" | "reopen" | "ready" | "draft";

interface SyncPullRequestAfterWriteInput {
	repo: RepoIdentity;
	prNumber: number;
	/** Names the write in the warning when the sync fails. */
	action: PullRequestWrite;
}

/**
 * After GitHub accepted a state change, bring the host's own copies in line
 * before the caller's refetch lands: the content cache would replay the
 * pre-write `gh pr view` for up to its TTL, and the `pull_requests` row the
 * sidebar chips read would wait for the next sweep. The row gets the state
 * the write implies first, so it is right even when the refresh cannot
 * fetch (no upstream to look up, a `gh` timeout, no linked workspace); the
 * refresh then fills in checks, reviews and GitHub's own timestamps for the
 * workspaces linked to this PR, through the per-workspace sync queue.
 *
 * Never throws: GitHub already applied the change, so nothing here may
 * surface as a failed action. The sweep heals whatever a failure skipped.
 */
export async function syncPullRequestAfterWrite(
	ctx: Pick<HostServiceContext, "db" | "runtime">,
	input: SyncPullRequestAfterWriteInput,
): Promise<void> {
	evictPullRequestContent(input.repo, input.prNumber);
	let workspaceIds: string[] = [];
	try {
		const rows = findPullRequestRows(ctx.db, input.repo, input.prNumber);
		if (rows.length === 0) return;
		for (const row of rows) recordWrittenState(ctx.db, row, input.action);

		workspaceIds = findLinkedWorkspaceIds(
			ctx.db,
			rows.map((row) => row.id),
		);
		if (workspaceIds.length === 0) return;
		await ctx.runtime.pullRequests.refreshPullRequestsByWorkspaces(
			workspaceIds,
		);
	} catch (error) {
		console.warn(
			`[pull-requests:${input.action}] GitHub applied the change but the host-side sync failed`,
			{
				repo: `${input.repo.owner}/${input.repo.name}`,
				prNumber: input.prNumber,
				workspaceIds,
				error,
			},
		);
	}
}

function recordWrittenState(
	db: HostServiceContext["db"],
	row: LinkedPullRequestRow,
	action: PullRequestWrite,
): void {
	const now = Date.now();
	const isDraft =
		action === "ready" ? false : action === "draft" ? true : row.isDraft;
	const state =
		action === "merge"
			? "merged"
			: action === "close"
				? "closed"
				: isDraft
					? "draft"
					: "open";
	db.update(pullRequests)
		.set({
			state,
			isDraft,
			// Observation time until a fetch carries GitHub's own, never cleared.
			mergedAt: action === "merge" ? (row.mergedAt ?? now) : row.mergedAt,
			updatedAt: now,
		})
		.where(eq(pullRequests.id, row.id))
		.run();
}
