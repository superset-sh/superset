import { z } from "zod";
import type { ExecGh } from "../../../trpc/router/workspace-creation/utils/exec-gh";
import type {
	NormalizedIssueContent,
	NormalizedPullRequestContent,
	RepoRef,
} from "../types";

export const ghPullRequestContentSchema = z.object({
	number: z.number(),
	title: z.string(),
	body: z.string().nullable().optional(),
	url: z.string(),
	state: z.string(),
	headRefName: z.string(),
	baseRefName: z.string(),
	headRepositoryOwner: z.object({ login: z.string() }).nullable(),
	isCrossRepository: z.boolean(),
	isDraft: z.boolean(),
	author: z.object({ login: z.string() }).optional(),
	createdAt: z.string().optional(),
	updatedAt: z.string().optional(),
});

export const ghIssueContentSchema = z.object({
	number: z.number(),
	title: z.string(),
	body: z.string().nullable().optional(),
	url: z.string(),
	state: z.string(),
	author: z.object({ login: z.string() }).optional(),
	createdAt: z.string().optional(),
	updatedAt: z.string().optional(),
});

export async function fetchPullRequestContentGitHub(
	deps: { execGh: ExecGh },
	repo: RepoRef,
	prNumber: number,
): Promise<NormalizedPullRequestContent> {
	const raw = await deps.execGh([
		"pr",
		"view",
		String(prNumber),
		"--repo",
		`${repo.owner}/${repo.name}`,
		"--json",
		"number,title,body,url,state,author,headRefName,baseRefName,headRepositoryOwner,isCrossRepository,isDraft,createdAt,updatedAt",
	]);
	const data = ghPullRequestContentSchema.parse(raw);
	return {
		number: data.number,
		title: data.title,
		body: data.body ?? "",
		url: data.url,
		state: data.state.toLowerCase(),
		branch: data.headRefName,
		baseBranch: data.baseRefName,
		headRepositoryOwner: data.headRepositoryOwner?.login ?? null,
		isCrossRepository: data.isCrossRepository,
		author: data.author?.login ?? null,
		isDraft: data.isDraft,
		createdAt: data.createdAt,
		updatedAt: data.updatedAt,
	};
}

export async function fetchIssueContentGitHub(
	deps: { execGh: ExecGh },
	repo: RepoRef,
	issueNumber: number,
): Promise<NormalizedIssueContent> {
	const raw = await deps.execGh([
		"issue",
		"view",
		String(issueNumber),
		"--repo",
		`${repo.owner}/${repo.name}`,
		"--json",
		"number,title,body,url,state,author,createdAt,updatedAt",
	]);
	const data = ghIssueContentSchema.parse(raw);
	return {
		number: data.number,
		title: data.title,
		body: data.body ?? "",
		url: data.url,
		state: data.state.toLowerCase(),
		author: data.author?.login ?? null,
		createdAt: data.createdAt,
		updatedAt: data.updatedAt,
	};
}
