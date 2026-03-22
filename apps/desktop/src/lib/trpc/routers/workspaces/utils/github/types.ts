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
