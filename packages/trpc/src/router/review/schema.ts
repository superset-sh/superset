import { parseGithubPullRequestUrl } from "@superset/shared/github-pr-url";
import { z } from "zod";
import {
	hasCompleteWorkspaceLink,
	pageFields,
	WORKSPACE_LINK_MESSAGE,
} from "../page/schema";

/**
 * Field-level schemas shared by this router's inputs and by the MCP tool
 * definition that fronts them. A constraint declared here is declared once —
 * the agent-facing tool schema decorates these rather than restating them,
 * so the two can't drift.
 */
export const reviewFindingFields = {
	file: z.string().min(1),
	line: z.number().int().positive(),
	category: z.string().max(60),
	summary: z.string().min(1),
	shortSummary: z.string().max(200),
	failureScenario: z.string().min(1),
	verdict: z.enum(["CONFIRMED", "PLAUSIBLE"]),
} as const;

export const reviewFindingSchema = z.object({
	file: reviewFindingFields.file,
	line: reviewFindingFields.line.optional(),
	category: reviewFindingFields.category.optional(),
	summary: reviewFindingFields.summary,
	shortSummary: reviewFindingFields.shortSummary.optional(),
	failureScenario: reviewFindingFields.failureScenario,
	verdict: reviewFindingFields.verdict.optional(),
});

const publishReviewFieldsSchema = z.object({
	workspaceId: pageFields.workspaceId.optional(),
	entryPath: pageFields.entryPath.optional(),
	title: pageFields.title,
	description: pageFields.description.optional(),
	repo: z.string().max(200).optional(),
	prNumber: z.number().int().positive().optional(),
	prUrl: z.string().url().optional(),
	branch: z.string().max(200).optional(),
	commitSha: z.string().max(64).optional(),
	effortLevel: z.string().max(40).optional(),
	visibility: pageFields.visibility.optional(),
	findings: z.array(reviewFindingSchema),
	diff: z.string().max(2_000_000).optional(),
});

/**
 * A review publish must name either the PR it belongs to (a parseable
 * github.com pull request URL — the PR's identity is derived from the link,
 * not from any DB row) or the workspace/path it was published from — without
 * one of those, nothing can find this review again to add a version rather
 * than mint a duplicate page. Rejecting an unparseable prUrl here, when there
 * is no workspace fallback, turns a confusing later miss into a fast, clear
 * validation error.
 */
export const hasReviewAnchor = (value: {
	prUrl?: string | undefined;
	workspaceId?: string | undefined;
	entryPath?: string | undefined;
}) =>
	(value.prUrl != null && parseGithubPullRequestUrl(value.prUrl) !== null) ||
	Boolean(value.workspaceId && value.entryPath);

export const REVIEW_ANCHOR_MESSAGE = {
	message:
		"A review publish must name where it belongs: pass prUrl (a github.com pull request link), or workspaceId and entryPath",
	path: ["prUrl"],
};

export const publishReviewSchema = publishReviewFieldsSchema
	.refine(hasCompleteWorkspaceLink, WORKSPACE_LINK_MESSAGE)
	.refine(hasReviewAnchor, REVIEW_ANCHOR_MESSAGE);

export type PublishReviewInput = z.infer<typeof publishReviewSchema>;

export const getReviewForPullRequestSchema = z.object({
	prUrl: z
		.string()
		.url()
		.refine((url) => parseGithubPullRequestUrl(url) !== null, {
			message: "prUrl must be a github.com pull request link",
		}),
});
