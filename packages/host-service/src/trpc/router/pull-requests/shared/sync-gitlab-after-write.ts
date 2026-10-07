import { and, eq } from "drizzle-orm";
import { pullRequests } from "../../../../db/schema";
import type { HostServiceContext } from "../../../../types";
import { findLinkedWorkspaceIds } from "./linked-workspaces";

interface NativePullRequestWrite {
	repo: { host: string; owner: string; name: string };
	prNumber: number;
	expectedUrl?: string;
	action: "merge" | "close" | "reopen" | "ready";
	merged?: boolean;
}

export async function syncGitLabPullRequestAfterWrite(
	ctx: Pick<HostServiceContext, "db" | "runtime">,
	input: NativePullRequestWrite,
): Promise<void> {
	let workspaceIds: string[] = [];
	try {
		const rows = ctx.db
			.select({
				id: pullRequests.id,
				isDraft: pullRequests.isDraft,
				mergedAt: pullRequests.mergedAt,
			})
			.from(pullRequests)
			.where(
				and(
					eq(pullRequests.repoProvider, "gitlab"),
					eq(pullRequests.repoHost, input.repo.host),
					eq(pullRequests.repoOwner, input.repo.owner),
					eq(pullRequests.repoName, input.repo.name),
					eq(pullRequests.prNumber, input.prNumber),
					input.expectedUrl
						? eq(pullRequests.url, input.expectedUrl)
						: undefined,
				),
			)
			.all();
		if (rows.length === 0) return;
		if (input.action !== "merge" || input.merged === true) {
			const now = Date.now();
			for (const row of rows) {
				const state =
					input.action === "merge"
						? "merged"
						: input.action === "close"
							? "closed"
							: input.action === "ready"
								? "open"
								: row.isDraft
									? "draft"
									: "open";
				ctx.db
					.update(pullRequests)
					.set({
						state,
						updatedAt: now,
						...(input.action === "ready" ? { isDraft: false } : {}),
						...(input.action === "merge"
							? { mergedAt: row.mergedAt ?? now }
							: {}),
					})
					.where(eq(pullRequests.id, row.id))
					.run();
			}
		}
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
			`[pull-requests:${input.action}] GitLab applied the change but the host-side sync failed`,
			{
				host: input.repo.host,
				repo: `${input.repo.owner}/${input.repo.name}`,
				prNumber: input.prNumber,
				workspaceIds,
				error,
			},
		);
	}
}
