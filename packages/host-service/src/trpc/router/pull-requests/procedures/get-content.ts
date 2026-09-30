import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { fetchPullRequestChecksFromGlab } from "../../../../runtime/pull-requests/utils/gitlab-query";
import { protectedProcedure } from "../../../index";
import { execGh } from "../../workspace-creation/utils/exec-gh";
import {
	normalizePullRequestChecks,
	pullRequestCheckContextSchema,
} from "../pull-request-checks";
import { resolvePullRequestRepository } from "../resolve-repository";
import {
	pullRequestContentCacheKey,
	readPullRequestContentCache,
	writePullRequestContentCache,
} from "../shared/pull-request-content-cache";

const getContentInputSchema = z.object({
	projectId: z.string(),
	prNumber: z.number().int().positive(),
});

const ghPullRequestContentSchema = z.object({
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
	statusCheckRollup: z
		.array(pullRequestCheckContextSchema)
		.nullable()
		.optional(),
});

const gitlabPullRequestContentSchema = z.object({
	iid: z.number(),
	title: z.string(),
	description: z.string().nullable().optional(),
	web_url: z.string(),
	state: z.string(),
	source_branch: z.string(),
	target_branch: z.string(),
	sha: z.string(),
	source_project_id: z.number(),
	target_project_id: z.number(),
	draft: z.boolean().optional(),
	work_in_progress: z.boolean().optional(),
	author: z
		.object({
			username: z.string(),
			avatar_url: z.string().nullable().optional(),
		})
		.optional(),
	created_at: z.string().optional(),
	updated_at: z.string().optional(),
});

type PullRequestContent = {
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
	authorAvatarUrl?: string | null;
	isDraft: boolean;
	createdAt: string | undefined;
	updatedAt: string | undefined;
	checks: ReturnType<typeof normalizePullRequestChecks>["checks"];
	checksStatus: ReturnType<typeof normalizePullRequestChecks>["checksStatus"];
};

export const getContent = protectedProcedure
	.input(getContentInputSchema)
	.query(async ({ ctx, input }) => {
		const repo = await resolvePullRequestRepository(ctx, input.projectId);
		const cacheKey = pullRequestContentCacheKey(repo, input.prNumber);
		const cached = readPullRequestContentCache<PullRequestContent>(cacheKey);
		if (cached) return cached;

		const promise = (async (): Promise<PullRequestContent> => {
			try {
				if (repo.provider === "gitlab") {
					const raw = await ctx.execGlab(
						[
							"api",
							"--method",
							"GET",
							`projects/${encodeURIComponent(`${repo.owner}/${repo.name}`)}/merge_requests/${input.prNumber}`,
						],
						{ cwd: repo.repoPath, hostname: repo.host },
					);
					const data = gitlabPullRequestContentSchema.parse(raw);
					const nodes = await fetchPullRequestChecksFromGlab(
						ctx.execGlab,
						repo,
						data.sha,
						repo.repoPath,
					);
					const { checks, checksStatus } = normalizePullRequestChecks(nodes);
					return {
						number: data.iid,
						title: data.title,
						body: data.description ?? "",
						url: data.web_url,
						state: data.state === "opened" ? "open" : data.state,
						branch: data.source_branch,
						baseBranch: data.target_branch,
						headRepositoryOwner: repo.owner,
						isCrossRepository:
							data.source_project_id !== data.target_project_id,
						author: data.author?.username ?? null,
						authorAvatarUrl: data.author?.avatar_url ?? null,
						isDraft: data.draft === true || data.work_in_progress === true,
						createdAt: data.created_at,
						updatedAt: data.updated_at,
						checks,
						checksStatus,
					};
				}
				const raw = await execGh([
					"pr",
					"view",
					String(input.prNumber),
					"--repo",
					`${repo.owner}/${repo.name}`,
					"--json",
					"number,title,body,url,state,author,headRefName,baseRefName,headRepositoryOwner,isCrossRepository,isDraft,createdAt,updatedAt,statusCheckRollup",
				]);
				const data = ghPullRequestContentSchema.parse(raw);
				const { checks, checksStatus } = normalizePullRequestChecks(
					data.statusCheckRollup,
				);
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
					checks,
					checksStatus,
				};
			} catch (err) {
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: `Failed to fetch PR #${input.prNumber}: ${err instanceof Error ? err.message : String(err)}`,
				});
			}
		})();
		writePullRequestContentCache(cacheKey, promise);
		return promise;
	});
