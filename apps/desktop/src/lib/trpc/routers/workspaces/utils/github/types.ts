import { z } from "zod";

// Zod schemas for gh CLI output validation
export const GHCheckContextSchema = z.object({
	name: z.string().optional(),
	context: z.string().optional(), // StatusContext uses 'context' instead of 'name'
	state: z.enum(["SUCCESS", "FAILURE", "PENDING", "ERROR"]).optional(),
	status: z.string().optional(), // CheckRun status: COMPLETED, IN_PROGRESS, etc.
	conclusion: z
		.enum([
			"SUCCESS",
			"FAILURE",
			"CANCELLED",
			"SKIPPED",
			"TIMED_OUT",
			"ACTION_REQUIRED",
			"NEUTRAL",
			"", // Can be empty string when in progress
		])
		.optional(),
	detailsUrl: z.string().optional(),
	targetUrl: z.string().optional(), // StatusContext uses 'targetUrl' instead of 'detailsUrl'
	startedAt: z.string().optional(),
	completedAt: z.string().optional(),
	workflowName: z.string().optional(),
});

export const GHReviewRequestSchema = z.object({
	login: z.string().optional(),
	name: z.string().optional(),
	slug: z.string().optional(),
	type: z.enum(["User", "Team"]).optional(),
});

export const GHCommentAuthorSchema = z.object({
	login: z.string().optional(),
	avatar_url: z.string().optional(),
});

export const GHGraphQLCommentAuthorSchema = z.object({
	login: z.string().optional(),
	avatarUrl: z.string().optional(),
});

export const GHCommentSchema = z.object({
	id: z.string().optional(),
	author: GHCommentAuthorSchema.nullable().optional(),
	body: z.string().optional(),
	createdAt: z.string().optional(),
	url: z.string().optional(),
});

export const GHReviewCommentSchema = z.object({
	id: z.number(),
	user: GHCommentAuthorSchema.nullable().optional(),
	body: z.string().optional(),
	created_at: z.string().optional(),
	html_url: z.string().optional(),
	path: z.string().optional(),
	line: z.number().nullable().optional(),
	original_line: z.number().nullable().optional(),
});

export const GHReviewThreadCommentSchema = z.object({
	id: z.string().optional(),
	databaseId: z.number().nullable().optional(),
	author: GHGraphQLCommentAuthorSchema.nullable().optional(),
	body: z.string().optional(),
	createdAt: z.string().optional(),
	url: z.string().optional(),
	path: z.string().optional(),
	line: z.number().nullable().optional(),
	originalLine: z.number().nullable().optional(),
});

export const GHPageInfoSchema = z.object({
	hasNextPage: z.boolean(),
	endCursor: z.string().nullable(),
});

export const GHReviewThreadCommentsConnectionSchema = z.object({
	nodes: z.array(GHReviewThreadCommentSchema.nullable()).optional(),
	pageInfo: GHPageInfoSchema,
});

export const GHReviewThreadSchema = z.object({
	id: z.string().optional(),
	isResolved: z.boolean().optional(),
	comments: GHReviewThreadCommentsConnectionSchema.nullable().optional(),
});

export const GHReviewThreadsResponseSchema = z.object({
	data: z.object({
		repository: z
			.object({
				pullRequest: z
					.object({
						reviewThreads: z.object({
							nodes: z.array(GHReviewThreadSchema.nullable()).optional(),
							pageInfo: GHPageInfoSchema,
						}),
					})
					.nullable(),
			})
			.nullable(),
	}),
});

export const GHReviewThreadCommentsResponseSchema = z.object({
	data: z.object({
		node: z
			.object({
				comments: GHReviewThreadCommentsConnectionSchema,
			})
			.nullable(),
	}),
});

export const GHIssueCommentSchema = z.object({
	id: z.number(),
	user: GHCommentAuthorSchema.nullable().optional(),
	body: z.string().optional(),
	created_at: z.string().optional(),
	html_url: z.string().optional(),
});

export const GHPRResponseSchema = z.object({
	number: z.number(),
	title: z.string(),
	url: z.string(),
	state: z.enum(["OPEN", "CLOSED", "MERGED"]),
	isDraft: z.boolean(),
	mergedAt: z.string().nullable(),
	additions: z.number(),
	deletions: z.number(),
	headRefOid: z.string(),
	headRefName: z.string(),
	headRepository: z
		.object({
			name: z.string().optional(),
		})
		.nullable()
		.optional(),
	headRepositoryOwner: z
		.object({
			login: z.string().optional(),
		})
		.nullable()
		.optional(),
	isCrossRepository: z.boolean().optional(),
	reviewDecision: z
		.enum(["APPROVED", "CHANGES_REQUESTED", "REVIEW_REQUIRED", ""])
		.nullable(),
	// statusCheckRollup is an array directly, not { contexts: [...] }
	statusCheckRollup: z.array(GHCheckContextSchema).nullable(),
	comments: z.array(GHCommentSchema).nullable().optional(),
	reviewRequests: z.array(GHReviewRequestSchema).nullable().optional(),
});

export const GHRepoResponseSchema = z.object({
	url: z.string(),
	isFork: z.boolean().optional().default(false),
	parent: z.object({ url: z.string() }).nullable().optional(),
});

export interface RepoContext {
	repoUrl: string;
	upstreamUrl: string;
	isFork: boolean;
}

export type GHPRResponse = z.infer<typeof GHPRResponseSchema>;

// --- GraphQL batch PR query response schemas ---
// __typename is always present in GraphQL when requested, so it's required
// here and used as the discriminator for union parsing.

const GHGraphQLCheckRunSchema = z.object({
	__typename: z.literal("CheckRun"),
	name: z.string().optional(),
	conclusion: z
		.enum([
			"SUCCESS",
			"FAILURE",
			"CANCELLED",
			"SKIPPED",
			"TIMED_OUT",
			"ACTION_REQUIRED",
			"NEUTRAL",
			"",
		])
		.nullable()
		.optional(),
	detailsUrl: z.string().optional(),
	status: z.string().optional(),
});

const GHGraphQLStatusContextSchema = z.object({
	__typename: z.literal("StatusContext"),
	context: z.string().optional(),
	state: z.enum(["SUCCESS", "FAILURE", "PENDING", "ERROR"]).optional(),
	targetUrl: z.string().nullable().optional(),
});

const GHGraphQLCheckContextNodeSchema = z.discriminatedUnion("__typename", [
	GHGraphQLCheckRunSchema,
	GHGraphQLStatusContextSchema,
]);

const GHGraphQLReviewerUserSchema = z.object({
	__typename: z.literal("User"),
	login: z.string(),
});

const GHGraphQLReviewerTeamSchema = z.object({
	__typename: z.literal("Team"),
	slug: z.string().optional(),
	name: z.string().optional(),
});

export const GHGraphQLPRNodeSchema = z.object({
	number: z.number(),
	title: z.string(),
	url: z.string(),
	state: z.enum(["OPEN", "CLOSED", "MERGED"]),
	isDraft: z.boolean(),
	mergedAt: z.string().nullable(),
	additions: z.number(),
	deletions: z.number(),
	headRefOid: z.string(),
	headRefName: z.string(),
	headRepository: z
		.object({ name: z.string().optional() })
		.nullable()
		.optional(),
	headRepositoryOwner: z
		.object({ login: z.string().optional() })
		.nullable()
		.optional(),
	isCrossRepository: z.boolean().optional(),
	reviewDecision: z
		.enum(["APPROVED", "CHANGES_REQUESTED", "REVIEW_REQUIRED", ""])
		.nullable()
		.optional(),
	commits: z
		.object({
			nodes: z
				.array(
					z
						.object({
							commit: z
								.object({
									statusCheckRollup: z
										.object({
											contexts: z.object({
												nodes: z.array(
													GHGraphQLCheckContextNodeSchema.nullable(),
												),
											}),
										})
										.nullable()
										.optional(),
								})
								.nullable(),
						})
						.nullable(),
				)
				.nullable(),
		})
		.nullable()
		.optional(),
	reviewRequests: z
		.object({
			nodes: z
				.array(
					z
						.object({
							requestedReviewer: z
								.discriminatedUnion("__typename", [
									GHGraphQLReviewerUserSchema,
									GHGraphQLReviewerTeamSchema,
								])
								.nullable()
								.optional(),
						})
						.nullable(),
				)
				.nullable(),
		})
		.nullable()
		.optional(),
});

export type GHGraphQLPRNode = z.infer<typeof GHGraphQLPRNodeSchema>;

/**
 * Converts a GraphQL PR node into the same `GHPRResponse` shape that
 * `gh pr view --json` produces, so downstream formatting functions
 * (`formatPRData`, `parseChecks`, etc.) work unchanged.
 */
export function normalizeGraphQLPR(node: GHGraphQLPRNode): GHPRResponse {
	const checkContexts =
		node.commits?.nodes?.[0]?.commit?.statusCheckRollup?.contexts?.nodes;

	const statusCheckRollup: GHPRResponse["statusCheckRollup"] = checkContexts
		? checkContexts
				.filter((ctx): ctx is NonNullable<typeof ctx> => ctx !== null)
				.map((ctx) => {
					if (ctx.__typename === "CheckRun") {
						return {
							name: ctx.name,
							conclusion: ctx.conclusion ?? undefined,
							detailsUrl: ctx.detailsUrl,
							status: ctx.status,
						};
					}
					return {
						context: ctx.context,
						state: ctx.state,
						targetUrl: ctx.targetUrl ?? undefined,
					};
				})
		: null;

	const reviewRequests: GHPRResponse["reviewRequests"] =
		node.reviewRequests?.nodes
			?.filter((rr): rr is NonNullable<typeof rr> => rr !== null)
			.map((rr) => {
				const reviewer = rr.requestedReviewer;
				if (!reviewer) return {};
				if (reviewer.__typename === "User") {
					return { login: reviewer.login, type: "User" as const };
				}
				return {
					slug: reviewer.slug,
					name: reviewer.name,
					type: "Team" as const,
				};
			}) ?? null;

	return {
		number: node.number,
		title: node.title,
		url: node.url,
		state: node.state,
		isDraft: node.isDraft,
		mergedAt: node.mergedAt,
		additions: node.additions,
		deletions: node.deletions,
		headRefOid: node.headRefOid,
		headRefName: node.headRefName,
		headRepository: node.headRepository,
		headRepositoryOwner: node.headRepositoryOwner,
		isCrossRepository: node.isCrossRepository,
		reviewDecision: node.reviewDecision ?? null,
		statusCheckRollup,
		reviewRequests,
	};
}

export const GHDeploymentSchema = z.object({
	id: z.number(),
	ref: z.string(),
	environment: z.string(),
	created_at: z.string(),
});

export const GHDeploymentStatusSchema = z.object({
	state: z.enum([
		"error",
		"failure",
		"inactive",
		"in_progress",
		"queued",
		"pending",
		"success",
	]),
	environment_url: z.string().optional(),
});
