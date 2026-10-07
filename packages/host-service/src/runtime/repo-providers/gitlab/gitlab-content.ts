import { computeChecksStatus } from "../../pull-requests/utils/pull-request-mappers";
import type {
	CheckContextNode,
	NormalizedIssueContent,
	NormalizedPullRequestContent,
	RepoRef,
} from "../types";
import {
	type GitLabCommitStatus,
	type GitLabPipeline,
	type GitLabPipelineJob,
	mapCommitStatusesToChecks,
	mapJobsToChecks,
	normalizeGitLabChecks,
} from "./gitlab-mappers";
import {
	encodeProjectPath,
	type GitLabRestDeps,
	GitLabRestError,
	gitlabRest,
	gitlabRestAll,
	resolveForkSourceProject,
} from "./gitlab-rest";

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

	const forkSource = isCrossRepository
		? await resolveForkSourceProject(
				{ ...deps, mergeRequest: prNumber },
				mr.source_project_id,
			)
		: null;
	const headRepositoryOwner: string | null = isCrossRepository
		? (forkSource?.owner ?? null)
		: repo.owner;

	const checks = normalizeGitLabChecks(
		isCrossRepository
			? forkSource
				? await fetchGitLabCheckContexts(
						{ ...deps, mergeRequest: prNumber },
						forkSource,
						mr.sha,
						mr.source_project_id,
					)
				: []
			: await fetchGitLabCheckContexts(deps, repo, mr.sha),
	);

	return {
		number: mr.iid,
		title: mr.title,
		body: mr.description ?? "",
		url: mr.web_url,
		state: mr.state === "opened" || mr.state === "locked" ? "open" : mr.state,
		branch: mr.source_branch,
		baseBranch: mr.target_branch,
		headRepositoryOwner,
		isCrossRepository,
		author: mr.author?.username ?? null,
		isDraft: mr.draft,
		createdAt: mr.created_at,
		updatedAt: mr.updated_at,
		checks,
		checksStatus: computeChecksStatus(checks),
	};
}

export async function fetchGitLabCheckContexts(
	deps: GitLabRestDeps,
	repo: RepoRef,
	sha: string,
	sourceProjectId?: number,
): Promise<CheckContextNode[]> {
	const enc = sourceProjectId ?? encodeProjectPath(repo.owner, repo.name);
	const nodes: CheckContextNode[] = [];
	try {
		const pipelines = await gitlabRest<GitLabPipeline[]>(
			deps,
			`/projects/${enc}/pipelines`,
			{ sha, per_page: 1 },
		);
		const pipeline = pipelines[0];
		if (pipeline) {
			const jobs = await gitlabRestAll<GitLabPipelineJob>(
				deps,
				`/projects/${enc}/pipelines/${pipeline.id}/jobs`,
			);
			nodes.push(...mapJobsToChecks(jobs, pipeline.id));
		}
	} catch (error) {
		if (!(error instanceof GitLabRestError && error.status === 404))
			throw error;
	}
	try {
		nodes.push(
			...mapCommitStatusesToChecks(
				await gitlabRestAll<GitLabCommitStatus>(
					deps,
					`/projects/${enc}/repository/commits/${sha}/statuses`,
				),
			),
		);
	} catch (error) {
		if (!(error instanceof GitLabRestError && error.status === 404))
			throw error;
	}
	return nodes;
}

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
