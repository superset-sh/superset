import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { execGh } from "../../workspace-creation/utils/exec-gh";
import {
	normalizePullRequestChecks,
	pullRequestCheckContextSchema,
} from "../pull-request-checks";
import {
	pullRequestContentCacheKey,
	readPullRequestContentCache,
	writePullRequestContentCache,
} from "./pull-request-content-cache";

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
	isDraft: boolean;
	createdAt: string | undefined;
	updatedAt: string | undefined;
	checks: ReturnType<typeof normalizePullRequestChecks>["checks"];
	checksStatus: ReturnType<typeof normalizePullRequestChecks>["checksStatus"];
};

export function fetchPullRequestContent(
	repo: { owner: string; name: string },
	prNumber: number,
): Promise<PullRequestContent> {
	const cacheKey = pullRequestContentCacheKey(repo, prNumber);
	const cached = readPullRequestContentCache<PullRequestContent>(cacheKey);
	if (cached) return cached;

	const promise = (async (): Promise<PullRequestContent> => {
		try {
			const raw = await execGh([
				"pr",
				"view",
				String(prNumber),
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
				message: `Failed to fetch PR #${prNumber}: ${err instanceof Error ? err.message : String(err)}`,
			});
		}
	})();
	writePullRequestContentCache(cacheKey, promise);
	return promise;
}
