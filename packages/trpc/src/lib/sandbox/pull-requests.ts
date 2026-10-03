import { timingSafeEqual } from "node:crypto";
import { db } from "@superset/db/client";
import {
	cloudWorkspacePullRequests,
	cloudWorkspaceRepositories,
	cloudWorkspaces,
	githubRepositories,
} from "@superset/db/schema";
import { and, eq, ne } from "drizzle-orm";
import { nudge } from "../realtime";
import { sandboxHostSecretFor } from "./access";

export type ReportSandboxPullRequestsOutcome =
	| "ok"
	| "unauthorized"
	| "unknown";

/**
 * Records the pull requests a box has linked, once each. Only repositories
 * the workspace checked out count, so a box can't attach another repo's PRs.
 */
export async function reportSandboxPullRequests(args: {
	workspaceId: string;
	presentedSecret: string;
	pullRequests: readonly { repository: string; number: number }[];
}): Promise<ReportSandboxPullRequestsOutcome> {
	const expected = Buffer.from(await sandboxHostSecretFor(args.workspaceId));
	const presented = Buffer.from(args.presentedSecret);
	if (
		expected.length !== presented.length ||
		!timingSafeEqual(expected, presented)
	) {
		return "unauthorized";
	}
	const [workspace] = await db
		.select({ organizationId: cloudWorkspaces.organizationId })
		.from(cloudWorkspaces)
		.where(
			and(
				eq(cloudWorkspaces.id, args.workspaceId),
				ne(cloudWorkspaces.status, "deleted"),
			),
		);
	if (!workspace) return "unknown";

	const repositories = await db
		.select({
			id: githubRepositories.id,
			fullName: githubRepositories.fullName,
		})
		.from(cloudWorkspaceRepositories)
		.innerJoin(
			githubRepositories,
			eq(cloudWorkspaceRepositories.repositoryId, githubRepositories.id),
		)
		.where(eq(cloudWorkspaceRepositories.cloudWorkspaceId, args.workspaceId));
	const repositoryIdByName = new Map(
		repositories.map((row) => [row.fullName.toLowerCase(), row.id]),
	);
	const rows = args.pullRequests.flatMap((pullRequest) => {
		const repositoryId = repositoryIdByName.get(
			pullRequest.repository.toLowerCase(),
		);
		return repositoryId
			? [
					{
						cloudWorkspaceId: args.workspaceId,
						repositoryId,
						prNumber: pullRequest.number,
					},
				]
			: [];
	});
	if (rows.length === 0) return "ok";

	const inserted = await db
		.insert(cloudWorkspacePullRequests)
		.values(rows)
		.onConflictDoNothing()
		.returning({ prNumber: cloudWorkspacePullRequests.prNumber });
	if (inserted.length > 0) {
		nudge(workspace.organizationId, "cloud_workspaces");
	}
	return "ok";
}
