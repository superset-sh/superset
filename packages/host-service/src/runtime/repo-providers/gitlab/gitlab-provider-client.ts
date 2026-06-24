import type {
	CheckContextNode,
	ConversationComment,
	IssueSearchFilters,
	IssuesPage,
	MergeResult,
	NormalizedIssueContent,
	NormalizedPullRequestContent,
	NormalizedReviewState,
	PullRequestCheckoutMetadata,
	PullRequestHeadRef,
	PullRequestNode,
	PullRequestSearchFilters,
	PullRequestState,
	PullRequestsPage,
	RepoProviderClient,
	RepoRef,
	ReviewThread,
	SearchRepoRef,
} from "../types";
import {
	fetchIssueContentGitLab,
	fetchPullRequestContentGitLab,
} from "./gitlab-content";
import {
	type GitLabCommitStatus,
	type GitLabMergeRequest,
	type GitLabPipeline,
	type GitLabPipelineJob,
	mapCommitStatusesToChecks,
	mapJobsToChecks,
	mapMergeRequestToNode,
} from "./gitlab-mappers";
import {
	encodeProjectPath,
	type GitLabRestDeps,
	GitLabRestError,
	gitlabRest,
	gitlabRestPost,
} from "./gitlab-rest";
import {
	fetchReviewThreadsGitLab,
	setReviewThreadResolutionGitLab,
} from "./gitlab-review";
import { searchIssuesGitLab, searchPullRequestsGitLab } from "./gitlab-search";

export interface GitLabProviderClientOptions {
	host: string;
	token: () => Promise<string | null>;
}

/**
 * GitLab implementation of the full provider client contract.
 * Implements all four capability interfaces: runtime, search, content, review.
 */
export class GitLabProviderClient implements RepoProviderClient {
	readonly provider = "gitlab" as const;
	readonly host: string;
	private readonly deps: GitLabRestDeps;

	constructor(options: GitLabProviderClientOptions) {
		this.host = options.host;
		this.deps = { host: options.host, token: options.token };
	}

	/**
	 * Fetch the most recently updated open/closed/merged MR for the given head branch.
	 * Returns null if no matching MR is found.
	 */
	async fetchPullRequestByHead(
		repo: RepoRef,
		head: PullRequestHeadRef,
	): Promise<PullRequestNode | null> {
		const enc = encodeProjectPath(repo.owner, repo.name);
		const mrs = await gitlabRest<GitLabMergeRequest[]>(
			this.deps,
			`/projects/${enc}/merge_requests`,
			{
				source_branch: head.branch,
				state: "all",
				order_by: "updated_at",
				per_page: 10,
			},
		);

		if (mrs.length === 0) return null;

		// GitLab returns results ordered by updated_at desc — take the first
		const mr = mrs[0] as GitLabMergeRequest;
		return mapMergeRequestToNode(mr, repo);
	}

	// ─── Write / checkout capabilities ───────────────────────────────────────

	/**
	 * Merge a GitLab MR.
	 *
	 * GitLab's merge API has no native "rebase then merge" that returns a stable
	 * commit SHA synchronously. We map "rebase" to a plain merge (same as
	 * "merge") and document the simplification. If callers require true rebase
	 * semantics they should call `PUT …/rebase` first and await the result.
	 *
	 * Reference: PUT /projects/:id/merge_requests/:iid/merge
	 */
	async mergePullRequest(
		repo: RepoRef,
		prNumber: number,
		method: "merge" | "squash" | "rebase",
	): Promise<MergeResult> {
		const enc = encodeProjectPath(repo.owner, repo.name);
		// GitLab supports squash via the `squash` body parameter.
		// "rebase" maps to a plain merge (no-squash) — GitLab's rebase is
		// asynchronous (PUT …/rebase → poll); we take the simple path here.
		const body: Record<string, unknown> = {
			squash: method === "squash",
		};
		const merged = await gitlabRestPost<GitLabMergeRequest>(
			this.deps,
			`/projects/${enc}/merge_requests/${prNumber}/merge`,
			body,
		);
		return {
			sha: merged.sha,
			merged: merged.state === "merged",
			message: merged.title,
		};
	}

	/**
	 * Fetch checkout metadata for a GitLab MR by IID.
	 *
	 * Maps the MR object fields to the PullRequestCheckoutMetadata shape so
	 * the PR checkout flow (workspaces.create with pr:) works for GitLab.
	 * Cross-repository forks: resolves owner/name via GET /projects/:source_project_id
	 * when `source_project_id !== target_project_id`.
	 *
	 * Reference: GET /projects/:id/merge_requests/:iid
	 */
	async fetchPullRequestMetadata(
		repo: RepoRef,
		prNumber: number,
	): Promise<PullRequestCheckoutMetadata> {
		const enc = encodeProjectPath(repo.owner, repo.name);
		const mr = await gitlabRest<GitLabMergeRequest>(
			this.deps,
			`/projects/${enc}/merge_requests/${prNumber}`,
		);
		const isCrossRepo = mr.source_project_id !== mr.target_project_id;
		// Map GitLab state: "opened" → "open", "merged" → "merged", else "closed"
		const stateLower = (mr.state ?? "").toLowerCase();
		const state: PullRequestCheckoutMetadata["state"] =
			stateLower === "opened" || stateLower === "open"
				? "open"
				: stateLower === "merged"
					? "merged"
					: "closed";

		// For cross-repo (fork) MRs, resolve the fork namespace via the projects API.
		let headOwner = repo.owner;
		let headName = repo.name;
		if (isCrossRepo && mr.source_project_id) {
			try {
				const forkProject = await gitlabRest<{ path_with_namespace: string }>(
					this.deps,
					`/projects/${mr.source_project_id}`,
				);
				const pwn = forkProject.path_with_namespace ?? "";
				const slashIdx = pwn.lastIndexOf("/");
				if (slashIdx !== -1) {
					headOwner = pwn.slice(0, slashIdx);
					headName = pwn.slice(slashIdx + 1);
				}
			} catch {
				// Non-fatal: fall back to target repo coords (checkout may fail for
				// private forks but at least we don't crash here).
				headOwner = "";
				headName = "";
			}
		}

		return {
			number: mr.iid,
			url: mr.web_url,
			title: mr.title,
			headRefName: mr.source_branch,
			headRefOid: mr.sha,
			baseRefName: mr.target_branch,
			headRepositoryOwner: headOwner,
			headRepositoryName: headName,
			isCrossRepository: isCrossRepo,
			state,
		};
	}

	/**
	 * Fetch the authenticated GitLab user.
	 * Reference: GET /user → { username: string }
	 */
	async getAuthenticatedUser(): Promise<{ login: string } | null> {
		try {
			const user = await gitlabRest<{ username: string }>(this.deps, "/user");
			return user.username ? { login: user.username } : null;
		} catch (error) {
			console.warn("[gitlab-provider] getAuthenticatedUser failed:", error);
			return null;
		}
	}

	// ─── Search capability ────────────────────────────────────────────────────

	searchPullRequests(
		repo: SearchRepoRef,
		filters: PullRequestSearchFilters,
	): Promise<PullRequestsPage> {
		return searchPullRequestsGitLab(this.deps, repo, filters);
	}

	searchIssues(
		repo: SearchRepoRef,
		filters: IssueSearchFilters,
	): Promise<IssuesPage> {
		return searchIssuesGitLab(this.deps, repo, filters);
	}

	// ─── Content capability ───────────────────────────────────────────────────

	fetchPullRequestContent(
		repo: RepoRef,
		prNumber: number,
	): Promise<NormalizedPullRequestContent> {
		return fetchPullRequestContentGitLab(this.deps, repo, prNumber);
	}

	fetchIssueContent(
		repo: RepoRef,
		issueNumber: number,
	): Promise<NormalizedIssueContent> {
		return fetchIssueContentGitLab(this.deps, repo, issueNumber);
	}

	// ─── Review capability ────────────────────────────────────────────────────

	/**
	 * Fetch the GitLab MR's review/merge state verbatim (spec §6, no-reduction model).
	 * Combines the MR's `detailed_merge_status`, `blocking_discussions_resolved`,
	 * `has_conflicts` fields with the approvals endpoint data.
	 *
	 * prState unused: GitLab reads merge/approval state directly from the MR.
	 */
	async fetchReviewState(
		repo: RepoRef,
		prNumber: number,
		_prState: PullRequestState,
	): Promise<NormalizedReviewState> {
		const enc = encodeProjectPath(repo.owner, repo.name);
		const [mr, approvals] = await Promise.all([
			gitlabRest<{
				detailed_merge_status: string;
				blocking_discussions_resolved: boolean;
				has_conflicts: boolean;
			}>(this.deps, `/projects/${enc}/merge_requests/${prNumber}`),
			gitlabRest<{
				approvals_required: number;
				approvals_left: number;
				approved_by: { user: { username: string } }[];
			}>(this.deps, `/projects/${enc}/merge_requests/${prNumber}/approvals`),
		]);
		return {
			provider: "gitlab",
			detailedMergeStatus: mr.detailed_merge_status,
			approvalsRequired: approvals.approvals_required ?? null,
			approvalsLeft: approvals.approvals_left ?? null,
			approvedBy: (approvals.approved_by ?? []).map((a) => a.user.username),
			blockingDiscussionsResolved: mr.blocking_discussions_resolved,
			hasConflicts: mr.has_conflicts,
		};
	}

	/**
	 * Fetch MR discussions and split into review threads (diff notes with a
	 * position) and conversation comments (non-diff notes).
	 *
	 * Delegates to `fetchReviewThreadsGitLab` in `gitlab-review.ts`.
	 * Thread ids are composite (see that module for the format) so that
	 * `setReviewThreadResolution` can target the correct discussion without
	 * storing extra state.
	 */
	fetchReviewThreads(
		repo: RepoRef,
		prNumber: number,
	): Promise<{
		reviewThreads: ReviewThread[];
		conversationComments: ConversationComment[];
	}> {
		return fetchReviewThreadsGitLab(this.deps, repo, prNumber);
	}

	/**
	 * Resolve or unresolve a GitLab MR discussion thread.
	 *
	 * `threadId` must be a composite id produced by `fetchReviewThreads`:
	 * `gitlab:{owner}/{name}:{iid}:{discussionId}`.
	 */
	setReviewThreadResolution(
		threadId: string,
		resolved: boolean,
	): Promise<void> {
		return setReviewThreadResolutionGitLab(this.deps, threadId, resolved);
	}

	/**
	 * Fetch pipeline job check-runs and commit statuses for a given commit SHA.
	 * Combines both sources into a single CheckContextNode array.
	 * Tolerates 404 responses from either endpoint.
	 */
	async fetchChecks(
		repo: RepoRef,
		headSha: string,
	): Promise<CheckContextNode[]> {
		const enc = encodeProjectPath(repo.owner, repo.name);
		const result: CheckContextNode[] = [];

		// Fetch pipeline jobs (newest pipeline for this SHA)
		try {
			const pipelines = await gitlabRest<GitLabPipeline[]>(
				this.deps,
				`/projects/${enc}/pipelines`,
				{ sha: headSha, per_page: 1 },
			);

			if (pipelines.length > 0) {
				const pipeline = pipelines[0] as GitLabPipeline;
				try {
					const jobs = await gitlabRest<GitLabPipelineJob[]>(
						this.deps,
						`/projects/${enc}/pipelines/${pipeline.id}/jobs`,
						{ per_page: 100 },
					);
					result.push(...mapJobsToChecks(jobs));
				} catch (err) {
					if (!(err instanceof GitLabRestError)) throw err;
					// Tolerate errors fetching jobs for a specific pipeline
				}
			}
		} catch (err) {
			if (!(err instanceof GitLabRestError)) throw err;
			// Tolerate 404 from pipeline list endpoint
		}

		// Fetch commit statuses (from external CI integrations)
		try {
			const statuses = await gitlabRest<GitLabCommitStatus[]>(
				this.deps,
				`/projects/${enc}/repository/commits/${headSha}/statuses`,
				{ per_page: 100 },
			);
			result.push(...mapCommitStatusesToChecks(statuses));
		} catch (err) {
			if (!(err instanceof GitLabRestError)) throw err;
			// Tolerate 404 from statuses endpoint
		}

		return result;
	}
}
