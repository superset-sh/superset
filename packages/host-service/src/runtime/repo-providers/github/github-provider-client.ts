import type { Octokit } from "@octokit/rest";
import type { ExecGh } from "../../../trpc/router/workspace-creation/utils/exec-gh";
import {
	fetchPullRequestByHead,
	fetchPullRequestByHeadFromGh,
	fetchPullRequestChecks,
	fetchPullRequestChecksFromGh,
	fetchPullRequestReviewDecision,
	fetchPullRequestReviewDecisionFromGh,
} from "../../pull-requests/utils/github-query";
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
	ReviewDecisionRaw,
	ReviewThread,
	SearchRepoRef,
} from "../types";
import {
	fetchIssueContentGitHub,
	fetchPullRequestContentGitHub,
} from "./github-content";
import {
	fetchReviewThreadsGitHub,
	setReviewThreadResolutionGitHub,
} from "./github-review";
import { searchIssuesGitHub, searchPullRequestsGitHub } from "./github-search";

export interface GitHubProviderClientOptions {
	execGh: ExecGh;
	github: () => Promise<Octokit>;
	/** Defaults to github.com; carried for symmetry with multi-host providers. */
	host?: string;
}

/** Map the normalized PullRequestState to the uppercase variant expected by github-query. */
function toGhPrState(state: PullRequestState): "OPEN" | "CLOSED" | "MERGED" {
	if (state === "merged") return "MERGED";
	if (state === "closed") return "CLOSED";
	return "OPEN";
}

/**
 * GitHub implementation of {@link RepoRuntimeClient}. Centralizes the gh-CLI-first
 * / Octokit-fallback orchestration that previously lived inline in
 * PullRequestRuntimeManager. The query functions themselves are unchanged.
 */
export class GitHubProviderClient implements RepoProviderClient {
	readonly provider = "github" as const;
	readonly host: string;
	private readonly execGh: ExecGh;
	private readonly github: () => Promise<Octokit>;

	constructor(options: GitHubProviderClientOptions) {
		this.execGh = options.execGh;
		this.github = options.github;
		this.host = options.host ?? "github.com";
	}

	async fetchPullRequestByHead(
		repo: RepoRef,
		head: PullRequestHeadRef,
	): Promise<PullRequestNode | null> {
		try {
			return await fetchPullRequestByHeadFromGh(this.execGh, repo, head);
		} catch (ghError) {
			console.warn(
				"[github-provider] gh PR head lookup failed; falling back to Octokit",
				{ repo, head, error: ghError },
			);
			return fetchPullRequestByHead(await this.github(), repo, head);
		}
	}

	async fetchReviewDecision(
		repo: RepoRef,
		prNumber: number,
		prState: PullRequestState,
	): Promise<ReviewDecisionRaw> {
		const ghState = toGhPrState(prState);
		try {
			return await fetchPullRequestReviewDecisionFromGh(
				this.execGh,
				repo,
				prNumber,
				ghState,
			);
		} catch (ghError) {
			console.warn(
				"[github-provider] gh review-decision lookup failed; falling back to Octokit",
				{ repo, prNumber, error: ghError },
			);
			return fetchPullRequestReviewDecision(
				await this.github(),
				repo,
				prNumber,
				ghState,
			);
		}
	}

	async fetchReviewState(
		repo: RepoRef,
		prNumber: number,
		prState: PullRequestState,
	): Promise<NormalizedReviewState> {
		const reviewDecision = await this.fetchReviewDecision(
			repo,
			prNumber,
			prState,
		);
		return { provider: "github", reviewDecision };
	}

	async fetchChecks(
		repo: RepoRef,
		headSha: string,
	): Promise<CheckContextNode[]> {
		try {
			return await fetchPullRequestChecksFromGh(this.execGh, repo, headSha);
		} catch (ghError) {
			console.warn(
				"[github-provider] gh checks lookup failed; falling back to Octokit",
				{ repo, headSha, error: ghError },
			);
			return fetchPullRequestChecks(await this.github(), repo, headSha);
		}
	}

	async mergePullRequest(
		repo: RepoRef,
		prNumber: number,
		method: "merge" | "squash" | "rebase",
	): Promise<MergeResult> {
		const octokit = await this.github();
		const { data } = await octokit.pulls.merge({
			owner: repo.owner,
			repo: repo.name,
			pull_number: prNumber,
			merge_method: method,
		});
		return {
			sha: data.sha ?? "",
			merged: data.merged,
			message: data.message ?? "",
		};
	}

	async fetchPullRequestMetadata(
		repo: RepoRef,
		prNumber: number,
	): Promise<PullRequestCheckoutMetadata> {
		const result = await this.execGh(
			[
				"pr",
				"view",
				String(prNumber),
				"--repo",
				`${repo.owner}/${repo.name}`,
				"--json",
				"number,url,title,headRefName,headRefOid,baseRefName,headRepositoryOwner,headRepository,isCrossRepository,state",
			],
			{ timeout: 30_000 },
		);
		const parsed = result as {
			number: number;
			url: string;
			title: string;
			headRefName: string;
			headRefOid: string;
			baseRefName: string;
			headRepositoryOwner: { login: string } | null;
			headRepository: { name: string } | null;
			isCrossRepository: boolean;
			state: string;
		};
		const stateLower = parsed.state.toLowerCase();
		const state: PullRequestCheckoutMetadata["state"] =
			stateLower === "open"
				? "open"
				: stateLower === "merged"
					? "merged"
					: "closed";
		return {
			number: parsed.number,
			url: parsed.url,
			title: parsed.title,
			headRefName: parsed.headRefName,
			headRefOid: parsed.headRefOid,
			baseRefName: parsed.baseRefName,
			headRepositoryOwner: parsed.headRepositoryOwner?.login ?? "",
			headRepositoryName: parsed.headRepository?.name ?? "",
			isCrossRepository: parsed.isCrossRepository,
			state,
		};
	}

	async getAuthenticatedUser(): Promise<{ login: string } | null> {
		try {
			const result = await this.execGh(["api", "user", "--jq", ".login"]);
			const login = typeof result === "string" ? result.trim() : null;
			return login ? { login } : null;
		} catch (error) {
			console.warn("[github-provider] getAuthenticatedUser failed:", error);
			return null;
		}
	}

	searchPullRequests(
		repo: SearchRepoRef,
		filters: PullRequestSearchFilters,
	): Promise<PullRequestsPage> {
		return searchPullRequestsGitHub(
			{ execGh: this.execGh, github: this.github },
			repo,
			filters,
		);
	}

	searchIssues(
		repo: SearchRepoRef,
		filters: IssueSearchFilters,
	): Promise<IssuesPage> {
		return searchIssuesGitHub(
			{ execGh: this.execGh, github: this.github },
			repo,
			filters,
		);
	}

	fetchPullRequestContent(
		repo: RepoRef,
		prNumber: number,
	): Promise<NormalizedPullRequestContent> {
		return fetchPullRequestContentGitHub(
			{ execGh: this.execGh },
			repo,
			prNumber,
		);
	}

	fetchIssueContent(
		repo: RepoRef,
		issueNumber: number,
	): Promise<NormalizedIssueContent> {
		return fetchIssueContentGitHub({ execGh: this.execGh }, repo, issueNumber);
	}

	fetchReviewThreads(
		repo: RepoRef,
		prNumber: number,
	): Promise<{
		reviewThreads: ReviewThread[];
		conversationComments: ConversationComment[];
	}> {
		return fetchReviewThreadsGitHub({ github: this.github }, repo, prNumber);
	}

	setReviewThreadResolution(
		threadId: string,
		resolved: boolean,
	): Promise<void> {
		return setReviewThreadResolutionGitHub(
			{ github: this.github },
			threadId,
			resolved,
		);
	}
}
