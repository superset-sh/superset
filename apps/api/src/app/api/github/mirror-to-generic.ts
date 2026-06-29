import { db } from "@superset/db/client";
import {
	githubPullRequests,
	githubRepositories,
	type NormalizedReviewState,
	pullRequests,
	repositories,
} from "@superset/db/schema";
import { and, eq } from "drizzle-orm";

/**
 * Mirrors GitHub rows (`github_repositories` / `github_pull_requests`) into the
 * provider-agnostic `repositories` / `pull_requests` tables. Idempotent upserts —
 * serves as BOTH the one-time backfill (no scope) AND the dual-write the GitHub
 * writers call after each sync/webhook (scoped by org or single repo).
 *
 * `github_*` stays the source during the transition (deployed clients still read the
 * `github_*` Electric shapes — B2); the generic tables become the unified read path.
 * The eventual `DROP github_*` is a separate, later contract migration.
 *
 * Note: deletes are NOT handled here. `installation.deleted` cascades to generic rows
 * via `repositories.installation_id` (FK ON DELETE cascade); per-repo removal calls
 * `deleteGenericGithubRepo`.
 */
export async function mirrorGithubToGeneric(
	scope: { organizationId?: string; repoId?: string } = {},
): Promise<void> {
	// 1. github_repositories → repositories. Keep a repoId → generic-id map for PRs.
	const repoFilter = scope.repoId
		? eq(githubRepositories.repoId, scope.repoId)
		: scope.organizationId
			? eq(githubRepositories.organizationId, scope.organizationId)
			: undefined;
	const ghRepos = await db.select().from(githubRepositories).where(repoFilter);

	const genericIdByRepoId = new Map<string, string>();
	for (const gr of ghRepos) {
		const [row] = await db
			.insert(repositories)
			.values({
				provider: "github",
				host: "github.com",
				installationId: gr.installationId,
				organizationId: gr.organizationId,
				externalId: gr.repoId,
				owner: gr.owner,
				name: gr.name,
				fullName: gr.fullName,
				defaultBranch: gr.defaultBranch,
				isPrivate: gr.isPrivate,
			})
			.onConflictDoUpdate({
				target: [
					repositories.provider,
					repositories.host,
					repositories.externalId,
				],
				set: {
					installationId: gr.installationId,
					organizationId: gr.organizationId,
					owner: gr.owner,
					name: gr.name,
					fullName: gr.fullName,
					defaultBranch: gr.defaultBranch,
					isPrivate: gr.isPrivate,
					updatedAt: new Date(),
				},
			})
			.returning({ id: repositories.id });
		if (row) genericIdByRepoId.set(gr.repoId, row.id);
	}

	// 2. github_pull_requests → pull_requests (joined to resolve the generic repo).
	const prFilter = scope.repoId
		? eq(githubRepositories.repoId, scope.repoId)
		: scope.organizationId
			? eq(githubPullRequests.organizationId, scope.organizationId)
			: undefined;
	const ghPrs = await db
		.select({ pr: githubPullRequests, repoId: githubRepositories.repoId })
		.from(githubPullRequests)
		.innerJoin(
			githubRepositories,
			eq(githubPullRequests.repositoryId, githubRepositories.id),
		)
		.where(prFilter);

	for (const { pr, repoId } of ghPrs) {
		const repositoryId = genericIdByRepoId.get(repoId);
		if (!repositoryId) continue; // repo outside this scope — skip

		// GitHub variant of the §6 union: its server-computed verdict, stored as-is.
		const reviewStateJson: NormalizedReviewState = {
			provider: "github",
			reviewDecision: pr.reviewDecision,
		};

		await db
			.insert(pullRequests)
			.values({
				provider: "github",
				host: "github.com",
				repositoryId,
				organizationId: pr.organizationId,
				number: pr.prNumber,
				externalId: pr.nodeId,
				headBranch: pr.headBranch,
				headSha: pr.headSha,
				baseBranch: pr.baseBranch,
				title: pr.title,
				url: pr.url,
				authorLogin: pr.authorLogin,
				authorAvatarUrl: pr.authorAvatarUrl,
				state: pr.state,
				isDraft: pr.isDraft,
				additions: pr.additions,
				deletions: pr.deletions,
				changedFiles: pr.changedFiles,
				reviewStateJson,
				checksStatus: pr.checksStatus,
				checks: pr.checks,
				mergedAt: pr.mergedAt,
				closedAt: pr.closedAt,
				lastSyncedAt: pr.lastSyncedAt,
				updatedAt: pr.updatedAt,
			})
			.onConflictDoUpdate({
				target: [pullRequests.repositoryId, pullRequests.number],
				set: {
					externalId: pr.nodeId,
					headBranch: pr.headBranch,
					headSha: pr.headSha,
					baseBranch: pr.baseBranch,
					title: pr.title,
					url: pr.url,
					authorLogin: pr.authorLogin,
					authorAvatarUrl: pr.authorAvatarUrl,
					state: pr.state,
					isDraft: pr.isDraft,
					additions: pr.additions,
					deletions: pr.deletions,
					changedFiles: pr.changedFiles,
					reviewStateJson,
					checksStatus: pr.checksStatus,
					checks: pr.checks,
					mergedAt: pr.mergedAt,
					closedAt: pr.closedAt,
					lastSyncedAt: pr.lastSyncedAt,
					updatedAt: pr.updatedAt,
				},
			});
	}
}

/** Removes the mirrored generic repo for a GitHub repo id (cascades to its PRs). */
export async function deleteGenericGithubRepo(repoId: string): Promise<void> {
	await db
		.delete(repositories)
		.where(
			and(
				eq(repositories.provider, "github"),
				eq(repositories.host, "github.com"),
				eq(repositories.externalId, repoId),
			),
		);
}
