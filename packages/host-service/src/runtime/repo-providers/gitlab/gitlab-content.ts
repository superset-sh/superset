import type {
	NormalizedIssueContent,
	NormalizedPullRequestContent,
	RepoRef,
} from "../types";
import {
	encodeProjectPath,
	type GitLabRestDeps,
	gitlabRest,
} from "./gitlab-rest";

// ---------------------------------------------------------------------------
// Raw GitLab shapes for content (full MR / issue objects)
// ---------------------------------------------------------------------------

interface GitLabMRDetail {
	iid: number;
	title: string;
	web_url: string;
	state: string;
	draft: boolean;
	description: string | null | undefined;
	source_branch: string;
	target_branch: string;
	sha: string;
	source_project_id: number;
	target_project_id: number;
	author?: { username: string } | null;
	created_at: string;
	updated_at: string;
}

interface GitLabIssueDetail {
	iid: number;
	title: string;
	web_url: string;
	state: string;
	description: string | null | undefined;
	author?: { username: string } | null;
	created_at: string;
	updated_at: string;
}

// ---------------------------------------------------------------------------
// fetchPullRequestContentGitLab
// ---------------------------------------------------------------------------

/**
 * Fetch full MR content from GitLab.
 *
 * For same-project MRs, headRepositoryOwner is set to `repo.owner`.
 * For cross-project (fork) MRs, resolves the fork namespace via
 * GET /projects/:source_project_id → path_with_namespace.
 */
export async function fetchPullRequestContentGitLab(
	deps: GitLabRestDeps,
	repo: RepoRef,
	prNumber: number,
): Promise<NormalizedPullRequestContent> {
	const enc = encodeProjectPath(repo.owner, repo.name);
	const mr = await gitlabRest<GitLabMRDetail>(
		deps,
		`/projects/${enc}/merge_requests/${prNumber}`,
	);

	const isCrossRepository = mr.source_project_id !== mr.target_project_id;

	// Resolve fork owner for cross-repo MRs.
	let headRepositoryOwner: string | null = isCrossRepository
		? null
		: repo.owner;
	if (isCrossRepository && mr.source_project_id) {
		try {
			const forkProject = await gitlabRest<{ path_with_namespace: string }>(
				deps,
				`/projects/${mr.source_project_id}`,
			);
			const pwn = forkProject.path_with_namespace ?? "";
			const slashIdx = pwn.lastIndexOf("/");
			if (slashIdx !== -1) {
				headRepositoryOwner = pwn.slice(0, slashIdx);
			}
		} catch {
			// Non-fatal: leave as null if the fork project lookup fails.
		}
	}

	return {
		number: mr.iid,
		title: mr.title,
		body: mr.description ?? "",
		url: mr.web_url,
		state: mr.state,
		branch: mr.source_branch,
		baseBranch: mr.target_branch,
		headRepositoryOwner,
		isCrossRepository,
		author: mr.author?.username ?? null,
		isDraft: mr.draft,
		createdAt: mr.created_at,
		updatedAt: mr.updated_at,
	};
}

// ---------------------------------------------------------------------------
// fetchIssueContentGitLab
// ---------------------------------------------------------------------------

/**
 * Fetch full issue content from GitLab.
 *
 * NOTE: The GitLab issues REST API shape is DOCUMENTED but not live-validated
 * against a real instance. Mark for live validation before production rollout.
 */
export async function fetchIssueContentGitLab(
	deps: GitLabRestDeps,
	repo: RepoRef,
	issueNumber: number,
): Promise<NormalizedIssueContent> {
	const enc = encodeProjectPath(repo.owner, repo.name);
	const issue = await gitlabRest<GitLabIssueDetail>(
		deps,
		`/projects/${enc}/issues/${issueNumber}`,
	);

	return {
		number: issue.iid,
		title: issue.title,
		body: issue.description ?? "",
		url: issue.web_url,
		state: issue.state,
		author: issue.author?.username ?? null,
		createdAt: issue.created_at,
		updatedAt: issue.updated_at,
	};
}
