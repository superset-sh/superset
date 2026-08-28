import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
	hasCompleteWorkspaceLink,
	pageFields,
	WORKSPACE_LINK_MESSAGE,
} from "@superset/trpc/page-schema";
import {
	hasReviewAnchor,
	REVIEW_ANCHOR_MESSAGE,
	reviewFindingFields,
} from "@superset/trpc/review-schema";
import { z } from "zod";
import { createMcpCaller } from "../../caller";
import { defineTool } from "../../define-tool";
import { optionalish } from "../../optionalish";

// Field names are camelCase to match every other tool in this file (pageFields
// etc.) — the `--share` integration on the `/code-review` side is expected to
// map from ReportFindings' snake_case shape (file, failure_scenario,
// short_summary, verdict) onto this one. Constraints (min/max/enum) come from
// reviewFindingFields, declared once in the trpc schema, so the two can't
// drift — this only adds the MCP-specific null-tolerance and descriptions.
const reviewFindingInputSchema = z.object({
	file: reviewFindingFields.file.describe(
		"Repo-relative path of the file the finding is in.",
	),
	line: optionalish(reviewFindingFields.line).describe(
		"1-indexed line the finding anchors to.",
	),
	category: optionalish(reviewFindingFields.category).describe(
		'Short kebab-case slug of the finding type, e.g. "correctness".',
	),
	summary: reviewFindingFields.summary.describe(
		"One-sentence statement of the defect.",
	),
	shortSummary: optionalish(reviewFindingFields.shortSummary).describe(
		"Compressed label for compact UI (≤60 chars).",
	),
	failureScenario: reviewFindingFields.failureScenario.describe(
		"Concrete inputs/state → wrong output/crash.",
	),
	verdict: optionalish(reviewFindingFields.verdict).describe(
		"Set when a verify pass ran.",
	),
});

export function register(server: McpServer): void {
	defineTool(server, {
		name: "reviews_publish",
		annotations: { destructiveHint: false },
		description:
			"Publish a code review's findings as a shareable page and return its public URL. Builds on the same Pages infrastructure as `pages_publish` — read that tool's description for the underlying constraints (self-contained HTML rendering, no external requests). Unlike a generic page, a review defaults to `org` visibility, not `just_me`: a review is meant to be seen by the team as soon as it exists. Anchor the review so a later re-review of the same PR adds a version instead of minting a duplicate page: whenever the review is of a real GitHub PR, `prUrl` IS the anchor — its owner/repo/number are parsed straight out of the link (e.g. from `gh pr view <n> --json url`), no Superset-side GitHub integration required — and it is required unless `workspaceId` + `entryPath` are given as the fallback anchor. Passing both is fine and recommended when available.",
		inputSchema: z
			.object({
				workspaceId: optionalish(pageFields.workspaceId).describe(
					"The workspace this review ran in, if any. Get it from the SUPERSET_WORKSPACE_ID environment variable, or `superset workspaces list`.",
				),
				entryPath: optionalish(pageFields.entryPath).describe(
					"Where this review lives in the workspace, e.g. `.superset/review.html`. Required alongside workspaceId when prUrl is not a GitHub PR link.",
				),
				title: pageFields.title.describe("Review title, e.g. the PR title."),
				description: optionalish(pageFields.description),
				repo: optionalish(z.string().max(200)).describe(
					"`owner/repo`, used to link each finding's file:line to its GitHub blob.",
				),
				prNumber: optionalish(z.number().int().positive()),
				prUrl: optionalish(z.string().url()).describe(
					"The PR's github.com link, e.g. from `gh pr view <n> --json url`. This is the anchor: re-reviewing the same PR from anywhere adds a version to the same page.",
				),
				branch: optionalish(z.string().max(200)),
				commitSha: optionalish(z.string().max(64)).describe(
					"Commit the review ran against. Required alongside `repo` to link findings to GitHub.",
				),
				effortLevel: optionalish(z.string().max(40)).describe(
					"e.g. `low`, `high`, `ultra`.",
				),
				visibility: optionalish(pageFields.visibility).describe(
					"`org` (default) lets anyone in the organization open it; `just_me` keeps it private to the publisher.",
				),
				findings: z.array(reviewFindingInputSchema),
				diff: optionalish(z.string().max(2_000_000)).describe(
					"Raw unified diff text, e.g. the output of `gh pr diff <n>`. When given, the published page gets a Code tab alongside Summary, matching the app's own PR view.",
				),
			})
			.refine(hasCompleteWorkspaceLink, WORKSPACE_LINK_MESSAGE)
			.refine(hasReviewAnchor, REVIEW_ANCHOR_MESSAGE),
		handler: async (input, ctx) => {
			const caller = createMcpCaller(ctx);
			const { description, ...rest } = input;
			return caller.review.publish({
				...rest,
				// "" is the only value where this field passes validation, and a
				// republish patches on `!== undefined` — forwarding an empty
				// string would silently wipe an existing description.
				...(description ? { description } : {}),
			});
		},
	});
}
