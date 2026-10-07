import { parseGitRemote } from "@superset/shared/git-remote";
import { z } from "zod";
import type {
	CheckContextNode,
	ConversationComment,
	CreatePullRequestInput,
	IssueSearchFilters,
	IssuesPage,
	MergeResult,
	NormalizedIssueContent,
	NormalizedPullRequestContent,
	NormalizedReviewState,
	PullRequestCapabilities,
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
	fetchGitLabCheckContexts,
	fetchIssueContentGitLab,
	fetchPullRequestContentGitLab,
} from "./gitlab-content";
import {
	type GitLabMergeRequest,
	mapMergeRequestToNode,
} from "./gitlab-mappers";
import {
	encodeProjectPath,
	type GitLabRestDeps,
	GitLabRestError,
	gitlabRest,
	gitlabRestAll,
	gitlabRestPost,
	resolveForkSourceProject,
} from "./gitlab-rest";
import {
	fetchReviewThreadsGitLab,
	replyToReviewThreadGitLab,
	setReviewThreadResolutionGitLab,
} from "./gitlab-review";
import { searchIssuesGitLab, searchPullRequestsGitLab } from "./gitlab-search";

export interface GitLabProviderClientOptions extends GitLabRestDeps {
	rebasePollAttempts?: number;
	rebasePollIntervalMs?: number;
}

const checkoutId = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const checkoutBranch = z
	.string()
	.min(1)
	.refine(
		(value) =>
			!value.startsWith("-") &&
			!value.includes("..") &&
			!value.includes("@{") &&
			!/[\s~^:?*[\\]/.test(value) &&
			!value.endsWith(".") &&
			!value
				.split("/")
				.some(
					(part) => !part || part.startsWith(".") || part.endsWith(".lock"),
				),
	);
const checkoutProject = z.object({
	id: checkoutId,
	path_with_namespace: z.string(),
	http_url_to_repo: z.string(),
});
const checkoutMr = z.object({
	iid: checkoutId,
	project_id: checkoutId.optional(),
	source_project_id: checkoutId.nullable(),
	target_project_id: checkoutId,
	source_branch: checkoutBranch,
	target_branch: checkoutBranch,
	sha: z.string().regex(/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/i),
	title: z.string(),
	state: z.enum(["opened", "open", "locked", "merged", "closed"]),
	web_url: z.string(),
});
type CheckoutMr = Pick<
	GitLabMergeRequest,
	| "iid"
	| "title"
	| "web_url"
	| "sha"
	| "source_branch"
	| "target_branch"
	| "target_project_id"
> & { source_project_id: number | null; state: string };

export class GitLabProviderClient implements RepoProviderClient {
	readonly provider = "gitlab" as const;
	readonly host: string;
	private readonly deps: GitLabRestDeps;
	private readonly rebasePollAttempts: number;
	private readonly rebasePollIntervalMs: number;

	constructor(options: GitLabProviderClientOptions) {
		this.host = options.host;
		this.deps = options;
		this.rebasePollAttempts = options.rebasePollAttempts ?? 60;
		this.rebasePollIntervalMs = options.rebasePollIntervalMs ?? 1000;
	}

	async fetchPullRequestByHead(
		repo: RepoRef,
		head: PullRequestHeadRef,
	): Promise<PullRequestNode | null> {
		const enc = encodeProjectPath(repo.owner, repo.name);
		const mrs = await gitlabRestAll<GitLabMergeRequest>(
			this.deps,
			`/projects/${enc}/merge_requests`,
			{
				source_branch: head.branch,
				state: "all",
				order_by: "updated_at",
				sort: "desc",
			},
		);

		const sameProject = head.owner === repo.owner && head.repo === repo.name;
		const sources = new Map<number, { owner: string; name: string } | null>();
		for (const mr of mrs) {
			if (mr.source_branch !== head.branch) continue;
			const isFork = mr.source_project_id !== mr.target_project_id;
			if (sameProject) {
				if (!isFork) return mapMergeRequestToNode(mr, repo, null);
				continue;
			}
			if (!isFork || !mr.source_project_id) continue;
			if (!sources.has(mr.source_project_id))
				sources.set(
					mr.source_project_id,
					await resolveForkSourceProject(
						{ ...this.deps, mergeRequest: mr.iid },
						mr.source_project_id,
					),
				);
			const source = sources.get(mr.source_project_id);
			if (source?.owner === head.owner && source.name === head.repo)
				return mapMergeRequestToNode(mr, repo, source);
		}
		return null;
	}

	private async rebaseAndWait(enc: string, prNumber: number): Promise<void> {
		await gitlabRestPost<{ rebase_in_progress?: boolean }>(
			this.deps,
			`/projects/${enc}/merge_requests/${prNumber}/rebase`,
			{},
		);

		for (let attempt = 0; attempt < this.rebasePollAttempts; attempt++) {
			const mr = await gitlabRest<{
				rebase_in_progress?: boolean;
				merge_error?: string | null;
			}>(this.deps, `/projects/${enc}/merge_requests/${prNumber}`, {
				include_rebase_in_progress: true,
			});

			if (mr.merge_error) {
				throw new GitLabRestError(
					409,
					`GitLab rebase failed for !${prNumber}: ${mr.merge_error}`,
				);
			}
			if (typeof mr.rebase_in_progress !== "boolean")
				throw new GitLabRestError(502, "Invalid GitLab rebase status");
			if (!mr.rebase_in_progress) return;

			await new Promise((resolve) =>
				setTimeout(resolve, this.rebasePollIntervalMs),
			);
		}

		throw new GitLabRestError(
			504,
			`GitLab rebase for !${prNumber} did not finish within ${
				(this.rebasePollAttempts * this.rebasePollIntervalMs) / 1000
			}s`,
		);
	}

	async mergePullRequest(
		repo: RepoRef,
		prNumber: number,
		method: "merge" | "squash" | "rebase",
		options?: { commitMessage?: string; squash?: boolean },
	): Promise<MergeResult> {
		const enc = encodeProjectPath(repo.owner, repo.name);

		if (method === "rebase") {
			await this.rebaseAndWait(enc, prNumber);
		}

		const body: Record<string, unknown> = {
			...(method === "squash"
				? { squash: true }
				: options?.squash !== undefined
					? { squash: options.squash }
					: {}),
			...(options?.commitMessage
				? {
						[method === "squash"
							? "squash_commit_message"
							: "merge_commit_message"]: options.commitMessage,
					}
				: {}),
		};
		const merged = await gitlabRestPost<
			GitLabMergeRequest & {
				merge_commit_sha?: string | null;
				squash_commit_sha?: string | null;
			}
		>(this.deps, `/projects/${enc}/merge_requests/${prNumber}/merge`, body);
		return {
			sha: merged.merge_commit_sha ?? merged.squash_commit_sha ?? merged.sha,
			merged: merged.state === "merged",
			message: merged.title,
		};
	}

	async fetchPullRequestDiff(repo: RepoRef, prNumber: number): Promise<string> {
		const diffs = await gitlabRestAll<{
			old_path: string;
			new_path: string;
			diff: string;
			new_file?: boolean;
			deleted_file?: boolean;
			renamed_file?: boolean;
			too_large?: boolean;
			collapsed?: boolean;
		}>(
			this.deps,
			`/projects/${encodeProjectPath(repo.owner, repo.name)}/merge_requests/${prNumber}/diffs`,
		);
		return diffs
			.map((file) => {
				if (file.too_large || file.collapsed)
					throw new GitLabRestError(
						413,
						"GitLab omitted part of this merge request diff",
					);
				const path = (prefix: string, name: string) =>
					/[^\x21-\x7e]|["\\]/.test(name)
						? JSON.stringify(`${prefix}/${name}`)
						: `${prefix}/${name}`;
				return `diff --git ${path("a", file.old_path)} ${path("b", file.new_path)}\n--- ${file.new_file ? "/dev/null" : path("a", file.old_path)}\n+++ ${file.deleted_file ? "/dev/null" : path("b", file.new_path)}\n${file.diff}${file.diff.endsWith("\n") ? "" : "\n"}`;
			})
			.join("");
	}
	async createPullRequest(
		repo: RepoRef,
		input: CreatePullRequestInput,
	): Promise<{ number: number; url: string }> {
		const target = await gitlabRest<{ id: number }>(
			this.deps,
			`/projects/${encodeProjectPath(repo.owner, repo.name)}`,
		);
		const source = encodeProjectPath(input.head.owner, input.head.repo);
		const result = await gitlabRestPost<{ iid: number; web_url: string }>(
			this.deps,
			`/projects/${source}/merge_requests`,
			{
				source_branch: input.head.branch,
				target_branch: input.base,
				target_project_id: target.id,
				title:
					input.draft && !/^Draft:/i.test(input.title)
						? `Draft: ${input.title}`
						: input.title,
				description: input.body ?? "",
			},
			"POST",
		);
		return { number: result.iid, url: result.web_url };
	}
	async setPullRequestState(
		repo: RepoRef,
		prNumber: number,
		state: "open" | "closed",
	): Promise<void> {
		await gitlabRestPost(
			this.deps,
			`/projects/${encodeProjectPath(repo.owner, repo.name)}/merge_requests/${prNumber}`,
			{ state_event: state === "closed" ? "close" : "reopen" },
		);
	}
	async reopenPullRequest(repo: RepoRef, prNumber: number): Promise<void> {
		await this.setPullRequestState(repo, prNumber, "open");
	}
	async markPullRequestReady(repo: RepoRef, prNumber: number): Promise<void> {
		const path = `/projects/${encodeProjectPath(repo.owner, repo.name)}/merge_requests/${prNumber}`;
		const mr = await gitlabRest<{ title: string; draft: boolean }>(
			this.deps,
			path,
		);
		const title = mr.title.replace(
			/^(?:Draft:|WIP:|\[Draft\]|\(Draft\)|\[WIP\]|\(WIP\))\s*/i,
			"",
		);
		if (mr.draft && title === mr.title)
			throw new GitLabRestError(422, "GitLab draft title cannot be made ready");
		if (title !== mr.title) await gitlabRestPost(this.deps, path, { title });
	}
	async updatePullRequestBranch(
		repo: RepoRef,
		prNumber: number,
	): Promise<void> {
		await this.rebaseAndWait(
			encodeProjectPath(repo.owner, repo.name),
			prNumber,
		);
	}
	async dequeuePullRequest(_repo: RepoRef, _prNumber: number): Promise<void> {
		throw new GitLabRestError(
			422,
			"GitLab merge queue removal is not supported",
		);
	}
	async pullRequestCapabilities(
		repo: RepoRef,
		prNumber: number,
	): Promise<PullRequestCapabilities> {
		const enc = encodeProjectPath(repo.owner, repo.name);
		const [mr, project, user] = await Promise.all([
			gitlabRest<{
				draft?: boolean;
				state: string;
				author?: { id: number };
				user?: { can_merge?: boolean };
				source_project_id?: number;
				target_project_id?: number;
				allow_collaboration?: boolean;
				allow_maintainer_to_push?: boolean;
				squash?: boolean;
				squash_on_merge?: boolean;
			}>(this.deps, `/projects/${enc}/merge_requests/${prNumber}`),
			gitlabRest<{
				merge_method: "merge" | "rebase_merge" | "ff";
				squash_option: "never" | "always" | "default_on" | "default_off";
				permissions?: {
					project_access?: { access_level: number };
					group_access?: { access_level: number };
				};
			}>(this.deps, `/projects/${enc}`),
			gitlabRest<{ id: number }>(this.deps, "/user"),
		]);
		const level = Math.max(
			project.permissions?.project_access?.access_level ?? 0,
			project.permissions?.group_access?.access_level ?? 0,
		);
		const canEdit = level >= 30 || mr.author?.id === user.id;
		const opened = mr.state === "opened";
		if (
			!["merge", "rebase_merge", "ff"].includes(project.merge_method) ||
			!["never", "always", "default_on", "default_off"].includes(
				project.squash_option,
			)
		)
			throw new GitLabRestError(
				502,
				"GitLab project merge policy is missing or invalid",
			);
		return {
			merge: opened && !mr.draft && mr.user?.can_merge === true,
			close: opened && canEdit,
			reopen: mr.state === "closed" && canEdit,
			markReady: opened && !!mr.draft && canEdit,
			updateBranch:
				opened &&
				(mr.author?.id === user.id ||
					(level >= 30 &&
						(mr.source_project_id === mr.target_project_id ||
							mr.allow_collaboration === true ||
							mr.allow_maintainer_to_push === true))),
			dequeue: false,
			mergePolicy: {
				provider: "gitlab",
				method: project.merge_method,
				squash: project.squash_option,
				squashEnabled:
					project.squash_option === "always"
						? true
						: project.squash_option === "never"
							? false
							: (mr.squash_on_merge ??
								mr.squash ??
								project.squash_option === "default_on"),
			},
		};
	}

	async fetchPullRequestMetadata(
		repo: RepoRef,
		prNumber: number,
	): Promise<PullRequestCheckoutMetadata> {
		const enc = encodeProjectPath(repo.owner, repo.name);
		const mr = await gitlabRest<GitLabMergeRequest>(
			this.deps,
			`/projects/${enc}/merge_requests/${prNumber}`,
		);
		return this.checkoutMetadata(repo, mr);
	}

	private verifiedCheckoutProject(
		value: unknown,
		expectedPath?: string,
		expectedId?: number,
	) {
		const parsed = checkoutProject.safeParse(value);
		if (!parsed.success)
			throw new GitLabRestError(502, "Invalid GitLab checkout metadata");
		const project = parsed.data;
		let url: URL;
		try {
			url = new URL(project.http_url_to_repo);
		} catch {
			throw new GitLabRestError(502, "Invalid GitLab checkout metadata");
		}
		const remote = parseGitRemote(project.http_url_to_repo);
		if (
			url.protocol !== "https:" ||
			url.username ||
			url.password ||
			url.search ||
			url.hash ||
			url.pathname !== `/${project.path_with_namespace}.git` ||
			!remote ||
			remote.host !== this.host ||
			`${remote.owner}/${remote.name}` !== project.path_with_namespace ||
			(expectedPath !== undefined &&
				project.path_with_namespace !== expectedPath) ||
			(expectedId !== undefined && project.id !== expectedId)
		)
			throw new GitLabRestError(502, "Invalid GitLab checkout metadata");
		return project;
	}

	async fetchVerifiedPullRequestMetadata(repo: RepoRef, prNumber: number) {
		if (!checkoutId.safeParse(prNumber).success)
			throw new GitLabRestError(502, "Invalid GitLab checkout metadata");
		const path = `${repo.owner}/${repo.name}`,
			enc = encodeProjectPath(repo.owner, repo.name);
		const project = this.verifiedCheckoutProject(
			await gitlabRest<unknown>(this.deps, `/projects/${enc}`),
			path,
		);
		const parsed = checkoutMr.safeParse(
			await gitlabRest<unknown>(
				this.deps,
				`/projects/${enc}/merge_requests/${prNumber}`,
			),
		);
		if (!parsed.success)
			throw new GitLabRestError(502, "Invalid GitLab checkout metadata");
		const mr = parsed.data;
		if (
			mr.iid !== prNumber ||
			mr.target_project_id !== project.id ||
			(mr.project_id !== undefined && mr.project_id !== project.id) ||
			mr.web_url !== `https://${this.host}/${path}/-/merge_requests/${prNumber}`
		)
			throw new GitLabRestError(502, "Invalid GitLab checkout metadata");
		return {
			...(await this.checkoutMetadata(repo, mr, true)),
			projectId: String(project.id),
			sourceProjectId:
				mr.source_project_id === null ? null : String(mr.source_project_id),
			targetProjectId: String(mr.target_project_id),
		};
	}

	private async checkoutMetadata(
		repo: RepoRef,
		mr: CheckoutMr,
		verified = false,
	): Promise<PullRequestCheckoutMetadata> {
		const isCrossRepo = mr.source_project_id !== mr.target_project_id;
		const stateLower = (mr.state ?? "").toLowerCase();
		const state: PullRequestCheckoutMetadata["state"] =
			stateLower === "opened" ||
			stateLower === "open" ||
			stateLower === "locked"
				? "open"
				: stateLower === "merged"
					? "merged"
					: "closed";

		let headOwner = repo.owner;
		let headName = repo.name;
		let headRepositoryUrl: string | null =
			`https://${this.host}/${repo.owner}/${repo.name}.git`;
		if (isCrossRepo) {
			headOwner = "";
			headName = "";
			headRepositoryUrl = null;
			if (mr.source_project_id) {
				try {
					const source = await gitlabRest<{
						id?: number;
						path_with_namespace: string;
						http_url_to_repo?: string;
					}>(
						{ ...this.deps, mergeRequest: mr.iid },
						`/projects/${mr.source_project_id}`,
					);
					if (verified)
						this.verifiedCheckoutProject(
							source,
							undefined,
							mr.source_project_id,
						);
					const slash = source.path_with_namespace.lastIndexOf("/");
					if (slash > 0) {
						headOwner = source.path_with_namespace.slice(0, slash);
						headName = source.path_with_namespace.slice(slash + 1);
						headRepositoryUrl =
							source.http_url_to_repo ??
							`https://${this.host}/${source.path_with_namespace}.git`;
					}
				} catch (error) {
					if (!(error instanceof GitLabRestError && error.status === 404))
						throw error;
				}
			}
		}

		return {
			provider: this.provider,
			host: this.host,
			headRepositoryUrl,
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

	async getAuthenticatedUser(): Promise<{ login: string } | null> {
		try {
			const user = await gitlabRest<{ username: string }>(this.deps, "/user");
			return user.username ? { login: user.username } : null;
		} catch (error) {
			console.warn("[gitlab-provider] getAuthenticatedUser failed:", error);
			return null;
		}
	}

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

	async fetchReviewState(
		repo: RepoRef,
		prNumber: number,
		_prState: PullRequestState,
	): Promise<NormalizedReviewState> {
		const enc = encodeProjectPath(repo.owner, repo.name);
		const [mr, approvals] = await Promise.all([
			gitlabRest<{
				state?: string;
				detailed_merge_status: string;
				blocking_discussions_resolved: boolean;
				has_conflicts: boolean;
			}>(this.deps, `/projects/${enc}/merge_requests/${prNumber}`),
			gitlabRest<{
				approvals_required?: number;
				approvals_left?: number;
				approved_by: { user: { username: string } }[];
			}>(
				this.deps,
				`/projects/${enc}/merge_requests/${prNumber}/approvals`,
			).catch((error) => {
				if (error instanceof GitLabRestError && error.status === 404)
					return {
						approved_by: [],
						approvals_required: undefined,
						approvals_left: undefined,
					};
				throw error;
			}),
		]);
		return {
			provider: "gitlab",
			...(mr.state ? { state: mr.state } : {}),
			detailedMergeStatus: mr.detailed_merge_status,
			approvalsRequired: approvals.approvals_required ?? null,
			approvalsLeft: approvals.approvals_left ?? null,
			approvedBy: (approvals.approved_by ?? []).map((a) => a.user.username),
			blockingDiscussionsResolved: mr.blocking_discussions_resolved,
			hasConflicts: mr.has_conflicts,
		};
	}

	fetchReviewThreads(
		repo: RepoRef,
		prNumber: number,
	): Promise<{
		reviewThreads: ReviewThread[];
		conversationComments: ConversationComment[];
	}> {
		return fetchReviewThreadsGitLab(this.deps, repo, prNumber);
	}

	setReviewThreadResolution(
		threadId: string,
		resolved: boolean,
	): Promise<void> {
		return setReviewThreadResolutionGitLab(this.deps, threadId, resolved);
	}

	replyToReviewThread(threadId: string, body: string): Promise<void> {
		return replyToReviewThreadGitLab(this.deps, threadId, body);
	}

	fetchChecks(repo: RepoRef, headSha: string): Promise<CheckContextNode[]> {
		return fetchGitLabCheckContexts(this.deps, repo, headSha);
	}
}
