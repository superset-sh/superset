import type { ParsedRemote } from "@superset/shared/git-remote";
import { repositoryIdentityKey } from "@superset/shared/repo-identity";
import { TRPCError } from "@trpc/server";
import { gitLabApiDeps } from "../../../../runtime/git/gitlab-api";
import { GitLabProviderClient } from "../../../../runtime/repo-providers/gitlab/gitlab-provider-client";
import type { NormalizedPullRequestContent } from "../../../../runtime/repo-providers/types";
import type { HostServiceContext } from "../../../../types";
import {
	type ResolvedRepo,
	resolveRepo,
} from "../../workspace-creation/shared/project-helpers";
import { GitLabReadCache } from "./gitlab-read-cache";

export function gitLabClient(ctx: HostServiceContext, repo: ResolvedRepo) {
	return new GitLabProviderClient(gitLabApiDeps(ctx.credentials, repo));
}

export async function resolveGitLabProject(
	ctx: HostServiceContext,
	projectId: string,
) {
	let repo: ResolvedRepo;
	try {
		repo = await resolveRepo(ctx, projectId);
	} catch (error) {
		if (
			error instanceof TRPCError &&
			(error.code === "PRECONDITION_FAILED" || error.code === "BAD_REQUEST")
		) {
			return null;
		}
		throw error;
	}
	return repo.provider === "gitlab"
		? { repo, client: gitLabClient(ctx, repo) }
		: null;
}

export async function resolveGitLabThread(
	ctx: HostServiceContext,
	input: { projectId?: string; prNumber?: number; threadId: string },
) {
	const invalid = () =>
		new TRPCError({
			code: "BAD_REQUEST",
			message:
				"GitLab thread does not match the selected project and merge request",
		});
	if (!input.projectId || !input.prNumber) throw invalid();
	const [provider, encodedHost, project, iid, discussionId, extra] =
		input.threadId.split(":");
	let host: string;
	try {
		host = decodeURIComponent(encodedHost ?? "").toLowerCase();
	} catch {
		throw invalid();
	}
	if (
		provider !== "gitlab" ||
		!host ||
		!project ||
		iid !== String(input.prNumber) ||
		!discussionId ||
		!/^[\w-]+$/.test(discussionId) ||
		extra !== undefined
	)
		throw invalid();
	const repo = await resolveRepo(ctx, input.projectId, {
		validateRemote(remote: ParsedRemote) {
			if (
				remote.provider === "github" ||
				remote.host !== host ||
				`${remote.owner}/${remote.name}` !== project
			)
				throw invalid();
		},
	});
	if (repo.provider !== "gitlab") throw invalid();
	return { repo, client: gitLabClient(ctx, repo), discussionId };
}

const contentCache = new GitLabReadCache<NormalizedPullRequestContent>();
const diffCache = new GitLabReadCache<string>({
	size: (value) => Buffer.byteLength(value),
});
const cacheKey = (repo: ResolvedRepo, number: number) =>
	`${repositoryIdentityKey(repo)}#${number}`;

export function gitLabContent(
	repo: ResolvedRepo,
	client: GitLabProviderClient,
	number: number,
) {
	return contentCache.read(cacheKey(repo, number), () =>
		client.fetchPullRequestContent(repo, number),
	);
}

export function gitLabDiff(
	repo: ResolvedRepo,
	client: GitLabProviderClient,
	number: number,
) {
	return diffCache.read(cacheKey(repo, number), () =>
		client.fetchPullRequestDiff(repo, number),
	);
}

export function invalidateGitLabReads(repo: ResolvedRepo, number: number) {
	const key = cacheKey(repo, number);
	contentCache.delete(key);
	diffCache.delete(key);
}
