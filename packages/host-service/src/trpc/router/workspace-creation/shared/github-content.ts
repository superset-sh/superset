import type { HostServiceContext } from "../../../../types";
import {
	issueContentSchema,
	pullRequestContentSchema,
} from "../schemas";
import { execGh } from "../utils/exec-gh";
import { resolveGithubRepo } from "./project-helpers";

export interface IssueContent {
	number: number;
	title: string;
	body: string;
	url: string;
	state: string;
	author: string | null;
	createdAt: string | undefined;
	updatedAt: string | undefined;
}

export interface PullRequestContent {
	number: number;
	title: string;
	body: string;
	url: string;
	state: string;
	branch: string;
	baseBranch: string;
	headRepositoryOwner: string | null;
	isCrossRepository: boolean;
	author: string | null;
	isDraft: boolean;
	createdAt: string | undefined;
	updatedAt: string | undefined;
}

const PR_CONTENT_CACHE_TTL_MS = 30_000;
const prContentCache = new Map<
	string,
	{ promise: Promise<PullRequestContent>; fetchedAt: number }
>();

/**
 * Shared `gh issue view` fetcher. Used by the issue tRPC procedure
 * and by the launches/ host-resolve-ctx so the launch builder can
 * inline issue bodies into the agent prompt without going through
 * tRPC.
 */
export async function fetchGithubIssueContent(
	ctx: HostServiceContext,
	projectId: string,
	issueNumber: number,
): Promise<IssueContent> {
	const repo = await resolveGithubRepo(ctx, projectId);
	const raw = await execGh([
		"issue",
		"view",
		String(issueNumber),
		"--repo",
		`${repo.owner}/${repo.name}`,
		"--json",
		"number,title,body,url,state,author,createdAt,updatedAt",
	]);
	const data = issueContentSchema.parse(raw);
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

/**
 * Shared `gh pr view` fetcher with a 30s in-memory cache so repeat
 * picker clicks don't burn the user's GitHub token bucket. Cache
 * evicts on failure.
 */
export async function fetchGithubPullRequestContent(
	ctx: HostServiceContext,
	projectId: string,
	prNumber: number,
): Promise<PullRequestContent> {
	const repo = await resolveGithubRepo(ctx, projectId);
	const cacheKey = `${repo.owner.toLowerCase()}/${repo.name.toLowerCase()}#${prNumber}`;
	const cached = prContentCache.get(cacheKey);
	if (cached && Date.now() - cached.fetchedAt < PR_CONTENT_CACHE_TTL_MS) {
		return cached.promise;
	}

	const fetchedAt = Date.now();
	const promise = (async (): Promise<PullRequestContent> => {
		const raw = await execGh([
			"pr",
			"view",
			String(prNumber),
			"--repo",
			`${repo.owner}/${repo.name}`,
			"--json",
			"number,title,body,url,state,author,headRefName,baseRefName,headRepositoryOwner,isCrossRepository,isDraft,createdAt,updatedAt",
		]);
		const data = pullRequestContentSchema.parse(raw);
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
	})();
	promise.catch(() => {
		if (prContentCache.get(cacheKey)?.promise === promise) {
			prContentCache.delete(cacheKey);
		}
	});
	prContentCache.set(cacheKey, { promise, fetchedAt });
	return promise;
}
