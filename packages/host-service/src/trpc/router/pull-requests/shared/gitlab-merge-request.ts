import { TRPCError } from "@trpc/server";
import { fetchPullRequestDetailsFromGlab } from "../../../../runtime/pull-requests/utils/github-query";
import type { HostServiceContext } from "../../../../types";
import { fetchGitLabThreads } from "../../git/utils/gitlab-discussions";
import { execGlab } from "../../workspace-creation/utils/exec-glab";
import { normalizePullRequestChecks } from "../pull-request-checks";
import { syncPullRequestAfterWrite } from "./sync-after-write";

type PullRequestWrite = Parameters<
	typeof syncPullRequestAfterWrite
>[1]["action"];

/** What `glab mr view|list -F json` returns, as far as Superset reads it. */
interface MergeRequestJson {
	iid: number;
	title: string;
	description: string | null;
	web_url: string;
	state: string;
	draft: boolean;
	sha: string;
	source_branch: string;
	target_branch: string;
	source_project_id: number;
	target_project_id: number;
	author: { username: string } | null;
	created_at: string;
	updated_at: string;
	merged_at: string | null;
	closed_at: string | null;
	has_conflicts: boolean;
	detailed_merge_status: string;
	changes_count: string | null;
	reviewers: { username: string; name: string | null }[] | null;
	labels: string[] | null;
}

const glabMrJson = (projectUrl: string, ...args: string[]) =>
	execGlab(["mr", ...args, "-R", projectUrl, "-F", "json"]);

const toState = (state: string): "open" | "closed" | "merged" =>
	state === "opened" ? "open" : state === "merged" ? "merged" : "closed";

/**
 * Runs `glab mr <args> -R <project>` when the project is on GitLab, then
 * syncs the host's copies as a GitHub write does. False for other projects.
 */
export async function writeGitLabMergeRequest(
	ctx: HostServiceContext,
	input: { projectId: string; prNumber: number },
	action: PullRequestWrite,
	args: string[],
): Promise<boolean> {
	const repo = await ctx.runtime.pullRequests.getGitLabRepository(
		input.projectId,
	);
	if (!repo) return false;
	await execGlab(["mr", ...args, "-R", repo.url]);
	await syncPullRequestAfterWrite(ctx, {
		repo,
		prNumber: input.prNumber,
		action,
	});
	return true;
}

/** A merge request in the shape `fetchPullRequestContent` gives a GitHub PR. */
export async function fetchMergeRequestContent(
	repo: { owner: string; name: string; url: string },
	number: number,
) {
	const [raw, details] = await Promise.all([
		glabMrJson(repo.url, "view", String(number)),
		fetchPullRequestDetailsFromGlab(execGlab, repo, number),
	]);
	const mr = raw as MergeRequestJson;
	const { conversationComments } = await fetchGitLabThreads(mr.web_url);
	return {
		number: mr.iid,
		title: mr.title,
		body: mr.description ?? "",
		url: mr.web_url,
		state: toState(mr.state),
		branch: mr.source_branch,
		baseBranch: mr.target_branch,
		headRepositoryOwner: null,
		isCrossRepository: mr.source_project_id !== mr.target_project_id,
		author: mr.author?.username ?? null,
		isDraft: mr.draft,
		createdAt: mr.created_at,
		updatedAt: mr.updated_at,
		...normalizePullRequestChecks(details.checks),
		mergedAt: mr.merged_at,
		closedAt: mr.closed_at,
		mergeability: mr.has_conflicts
			? ("conflicting" as const)
			: mr.detailed_merge_status === "mergeable"
				? ("mergeable" as const)
				: ("unknown" as const),
		mergeStateStatus: null,
		additions: 0,
		deletions: 0,
		changedFiles: Number.parseInt(mr.changes_count ?? "", 10) || 0,
		reviewDecision: details.reviewDecision,
		reviewers: (mr.reviewers ?? []).map((reviewer) => ({
			login: reviewer.username,
			name: reviewer.name,
		})),
		comments: conversationComments.map((comment) => ({
			id: String(comment.id),
			kind: "comment" as const,
			author: { login: comment.user.login, name: null },
			body: comment.body,
			createdAt: comment.createdAt,
			reviewState: null,
			url: comment.htmlUrl,
		})),
		commits: [],
		labels: (mr.labels ?? []).map((name) => ({ name, color: null })),
	};
}

/** One project's merge requests, as `searchPullRequests` pages GitHub PRs. */
export async function searchMergeRequests(
	repo: { url: string },
	projectId: string,
	input: {
		query?: string;
		limit?: number;
		page?: number;
		includeClosed?: boolean;
		mergedOnly?: boolean;
	},
) {
	const page = input.page ?? 1;
	const limit = input.limit ?? 30;
	const query = input.query?.trim() ?? "";
	// `12`, `!12` or the MR's URL looks the MR up directly.
	const iid = /(?:^!?|\/-\/merge_requests\/)(\d+)\/?$/.exec(query)?.[1];
	const state = input.mergedOnly ? "--merged" : input.includeClosed && "--all";
	const raw = iid
		? [await glabMrJson(repo.url, "view", iid)]
		: await glabMrJson(
				repo.url,
				"list",
				...(state ? [state] : []),
				...(query ? ["--search", query] : []),
				...["--per-page", String(limit), "--page", String(page)],
			);
	const pullRequests = (Array.isArray(raw) ? raw : []).map(
		(mr: MergeRequestJson) => ({
			projectId,
			prNumber: mr.iid,
			title: mr.title,
			url: mr.web_url,
			state: toState(mr.state),
			isDraft: mr.draft,
			authorLogin: mr.author?.username ?? null,
			updatedAt: mr.updated_at,
			checks: [],
			checksStatus: "none" as const,
			additions: null,
			deletions: null,
			headRefName: mr.source_branch,
		}),
	);
	return {
		pullRequests,
		totalCount: (page - 1) * limit + pullRequests.length,
		hasNextPage: pullRequests.length === limit,
		page,
	};
}

/** What a workspace checks out for a merge request, as `gh pr view` gives it. */
export async function fetchMergeRequestMetadata(
	projectUrl: string,
	iid: number,
) {
	const mr = (await glabMrJson(
		projectUrl,
		"view",
		String(iid),
	)) as MergeRequestJson;
	if (mr.source_project_id !== mr.target_project_id) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: `Merge requests from forks are not supported yet (!${iid})`,
		});
	}
	return {
		number: mr.iid,
		url: mr.web_url,
		title: mr.title,
		headRefName: mr.source_branch,
		headRefOid: mr.sha,
		baseRefName: mr.target_branch,
		headRepositoryOwner: "",
		headRepositoryName: "",
		isCrossRepository: false,
		state: toState(mr.state),
	};
}
