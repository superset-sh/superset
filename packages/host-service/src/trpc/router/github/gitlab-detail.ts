import { z } from "zod";
import { gitLabApiDeps } from "../../../runtime/git/gitlab-api";
import {
	encodeProjectPath,
	GitLabRestError,
	gitlabRest,
} from "../../../runtime/repo-providers/gitlab/gitlab-rest";
import type { HostServiceContext } from "../../../types";
import type { GitLabAction } from "../git/gitlab-actions";

const user = z.object({
	username: z.string(),
	avatar_url: z.string().nullish(),
});
const metadata = z.object({
	id: z.number().int().positive(),
	iid: z.number().int().positive(),
	merged_at: z.string().nullish(),
	merged_by: user.nullish(),
	merge_user: user.nullish(),
	reviewers: z.array(user).default([]),
	changes_count: z.string().nullish(),
});

function diffStats(diff: string) {
	let additions = 0;
	let deletions = 0;
	let changedFiles = 0;
	let inHunk = false;
	for (const line of diff.split("\n")) {
		if (line.startsWith("diff --git ")) {
			changedFiles++;
			inHunk = false;
		} else if (line.startsWith("@@ ")) inHunk = true;
		else if (inHunk && line.startsWith("+")) additions++;
		else if (inHunk && line.startsWith("-")) deletions++;
	}
	return { additions, deletions, changedFiles };
}

export async function gitLabPullRequestDetail(
	ctx: HostServiceContext,
	action: GitLabAction,
	number: number,
) {
	const { client, repo } = action;
	const [content, state, capabilities, threads, diff, raw] = await Promise.all([
		client.fetchPullRequestContent(repo, number),
		client.fetchReviewState(repo, number, "open"),
		client.pullRequestCapabilities(repo, number),
		client.fetchReviewThreads(repo, number),
		client.fetchPullRequestDiff(repo, number).catch((error: unknown) => {
			if (error instanceof GitLabRestError && error.status === 413) return null;
			throw error;
		}),
		gitlabRest<unknown>(
			gitLabApiDeps(ctx.credentials, repo),
			`/projects/${encodeProjectPath(repo.owner, repo.name)}/merge_requests/${number}`,
		),
	]);
	const parsed = metadata.safeParse(raw);
	if (
		!parsed.success ||
		parsed.data.iid !== number ||
		content.number !== number ||
		content.url !==
			`https://${repo.host}/${repo.owner}/${repo.name}/-/merge_requests/${number}` ||
		state.provider !== "gitlab" ||
		capabilities.mergePolicy.provider !== "gitlab"
	)
		throw new GitLabRestError(
			502,
			"GitLab returned invalid merge request detail",
		);
	const mergedBy = parsed.data.merge_user ?? parsed.data.merged_by;
	const approved = new Set(state.approvedBy);
	const reviewers = new Map(
		parsed.data.reviewers.map((reviewer) => [
			reviewer.username,
			{
				login: reviewer.username,
				avatarUrl: reviewer.avatar_url ?? null,
				isTeam: false,
				state: approved.has(reviewer.username) ? "APPROVED" : "REQUESTED",
			},
		]),
	);
	for (const login of approved)
		if (!reviewers.has(login))
			reviewers.set(login, {
				login,
				avatarUrl: null,
				isTeam: false,
				state: "APPROVED",
			});
	const policy = capabilities.mergePolicy;
	const method = policy.method === "merge" ? "merge" : "rebase";
	const allowedMergeMethods =
		policy.squash === "always"
			? ["squash"]
			: policy.squash === "never"
				? [method]
				: [method, "squash"];
	const computing = [
		"checking",
		"unchecked",
		"preparing",
		"approvals_syncing",
	].includes(state.detailedMergeStatus);
	const stats = diffStats(diff ?? "");
	const changesCount = parsed.data.changes_count;
	const expectedFiles =
		changesCount != null && /^\d+$/.test(changesCount)
			? Number(changesCount)
			: null;
	const diffStatsComplete =
		diff !== null &&
		expectedFiles !== null &&
		Number.isSafeInteger(expectedFiles) &&
		expectedFiles === stats.changedFiles;
	return {
		pullRequest: {
			id: `gitlab:${encodeURIComponent(repo.host)}:${parsed.data.id}`,
			number: content.number,
			title: content.title,
			body: content.body,
			url: content.url,
			baseBranch: content.baseBranch,
			state: content.state,
			isDraft: content.isDraft,
			...stats,
			diffStatsComplete,
			mergedAt: parsed.data.merged_at ?? null,
			mergedBy:
				content.state === "merged" && mergedBy
					? { login: mergedBy.username, avatarUrl: mergedBy.avatar_url ?? null }
					: null,
		},
		checks: content.checks.map((check) => ({
			name: check.name,
			status: check.status === "pending" ? "IN_PROGRESS" : "COMPLETED",
			conclusion:
				check.status === "pending" ? null : check.status.toUpperCase(),
			isRequired: false,
			startedAt: check.startedAt ?? null,
			completedAt: check.completedAt ?? null,
			detailsUrl: check.url,
		})),
		reviewers: [...reviewers.values()],
		mergeability: {
			mergeable: state.hasConflicts
				? "CONFLICTING"
				: state.detailedMergeStatus === "mergeable"
					? "MERGEABLE"
					: "UNKNOWN",
			mergeStateStatus: state.hasConflicts
				? "DIRTY"
				: computing
					? "UNKNOWN"
					: state.detailedMergeStatus === "mergeable"
						? "CLEAN"
						: state.detailedMergeStatus === "need_rebase"
							? "BEHIND"
							: "BLOCKED",
			approvals: approved.size,
			requiredApprovals: state.approvalsRequired ?? 0,
			reviewDecision:
				state.approvalsLeft != null && state.approvalsLeft > 0
					? "REVIEW_REQUIRED"
					: state.approvalsRequired != null && state.approvalsRequired > 0
						? "APPROVED"
						: null,
			unresolvedThreads: threads.reviewThreads.filter(
				(thread) => !thread.isResolved && !thread.isOutdated,
			).length,
			requiresThreadResolution: !state.blockingDiscussionsResolved,
			queue: null,
			allowedMergeMethods,
		},
		capabilities: {
			merge: capabilities.merge,
			markReady: capabilities.markReady,
			updateBranch: capabilities.updateBranch,
			reopen: capabilities.reopen,
			dequeue: false,
		},
		provider: "gitlab" as const,
		host: repo.host,
		reviewState: state,
		mergePolicy: policy,
	};
}
