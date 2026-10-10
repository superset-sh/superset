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

const ghActorSchema = z.object({
	login: z.string().optional(),
	name: z.string().nullable().optional(),
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
	author: ghActorSchema.optional(),
	createdAt: z.string().optional(),
	updatedAt: z.string().optional(),
	mergedAt: z.string().nullable().optional(),
	closedAt: z.string().nullable().optional(),
	mergeable: z.string().nullable().optional(),
	mergeStateStatus: z.string().nullable().optional(),
	additions: z.number().nullable().optional(),
	deletions: z.number().nullable().optional(),
	changedFiles: z.number().nullable().optional(),
	reviewDecision: z.string().nullable().optional(),
	reviewRequests: z.array(ghActorSchema).nullable().optional(),
	reviews: z
		.array(
			z.object({
				id: z.string().nullable().optional(),
				author: ghActorSchema.nullable().optional(),
				body: z.string().nullable().optional(),
				state: z.string().nullable().optional(),
				submittedAt: z.string().nullable().optional(),
			}),
		)
		.nullable()
		.optional(),
	comments: z
		.array(
			z.object({
				id: z.string().nullable().optional(),
				author: ghActorSchema.nullable().optional(),
				body: z.string().nullable().optional(),
				createdAt: z.string().nullable().optional(),
				url: z.string().nullable().optional(),
			}),
		)
		.nullable()
		.optional(),
	labels: z
		.array(
			z.object({ name: z.string(), color: z.string().nullable().optional() }),
		)
		.nullable()
		.optional(),
	statusCheckRollup: z
		.array(pullRequestCheckContextSchema)
		.nullable()
		.optional(),
});

export const PULL_REQUEST_CONTENT_JSON_FIELDS =
	"number,title,body,url,state,author,headRefName,baseRefName,headRepositoryOwner,isCrossRepository,isDraft,createdAt,updatedAt,mergedAt,closedAt,mergeable,mergeStateStatus,additions,deletions,changedFiles,reviewDecision,reviewRequests,reviews,comments,labels,statusCheckRollup";

export type PullRequestMergeability = "mergeable" | "conflicting" | "unknown";

export interface PullRequestActor {
	login: string;
	name: string | null;
}

export interface PullRequestContentComment {
	id: string;
	kind: "comment" | "review";
	author: PullRequestActor | null;
	body: string;
	createdAt: string;
	/** GitHub review state (APPROVED, CHANGES_REQUESTED, COMMENTED…); null for plain comments. */
	reviewState: string | null;
	/** The comment's own page on GitHub; reviews carry none. */
	url: string | null;
}

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
	mergedAt: string | null;
	closedAt: string | null;
	mergeability: PullRequestMergeability;
	mergeStateStatus: string | null;
	additions: number;
	deletions: number;
	changedFiles: number;
	reviewDecision: string | null;
	reviewers: PullRequestActor[];
	comments: PullRequestContentComment[];
	labels: { name: string; color: string | null }[];
};

function normalizeMergeability(
	mergeable: string | null | undefined,
): PullRequestMergeability {
	switch (mergeable?.toUpperCase()) {
		case "MERGEABLE":
			return "mergeable";
		case "CONFLICTING":
			return "conflicting";
		default:
			return "unknown";
	}
}

function normalizeActor(
	actor: z.infer<typeof ghActorSchema> | null | undefined,
): PullRequestActor | null {
	const login = actor?.login?.trim();
	if (!login) return null;
	return { login, name: actor?.name?.trim() || null };
}

function count(value: number | null | undefined): number {
	return typeof value === "number" && value > 0 ? Math.floor(value) : 0;
}

function toContent(
	data: z.infer<typeof ghPullRequestContentSchema>,
): PullRequestContent {
	const { checks, checksStatus } = normalizePullRequestChecks(
		data.statusCheckRollup,
	);
	const reviewers = new Map<string, PullRequestActor>();
	for (const actor of [
		...(data.reviewRequests ?? []),
		...(data.reviews ?? [])
			.filter((review) => review.submittedAt)
			.map((review) => review.author),
	]) {
		const normalized = normalizeActor(actor);
		if (normalized) reviewers.set(normalized.login.toLowerCase(), normalized);
	}
	const comments: PullRequestContentComment[] = [
		...(data.comments ?? []).flatMap((comment, index) =>
			comment.createdAt
				? [
						{
							id: comment.id?.trim() || `comment-${index}-${comment.createdAt}`,
							kind: "comment" as const,
							author: normalizeActor(comment.author),
							body: comment.body ?? "",
							createdAt: comment.createdAt,
							reviewState: null,
							url: comment.url?.trim() || null,
						},
					]
				: [],
		),
		...(data.reviews ?? []).flatMap((review, index) =>
			review.submittedAt
				? [
						{
							id: review.id?.trim() || `review-${index}-${review.submittedAt}`,
							kind: "review" as const,
							author: normalizeActor(review.author),
							body: review.body ?? "",
							createdAt: review.submittedAt,
							reviewState: review.state?.trim() || null,
							url: null,
						},
					]
				: [],
		),
	];
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
		mergedAt: data.mergedAt?.trim() || null,
		closedAt: data.closedAt?.trim() || null,
		mergeability: normalizeMergeability(data.mergeable),
		mergeStateStatus: data.mergeStateStatus?.trim() || null,
		additions: count(data.additions),
		deletions: count(data.deletions),
		changedFiles: count(data.changedFiles),
		reviewDecision: data.reviewDecision?.trim() || null,
		reviewers: [...reviewers.values()],
		comments,
		labels: (data.labels ?? []).map((label) => ({
			name: label.name,
			color: label.color?.trim() || null,
		})),
	};
}

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
				PULL_REQUEST_CONTENT_JSON_FIELDS,
			]);
			return toContent(ghPullRequestContentSchema.parse(raw));
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
