import { describe, expect, test } from "bun:test";
import {
	attachmentLogsTxt,
	githubIssueAuthMiddleware,
	githubIssueTokenRotation,
	githubPrAuthRewrite,
	internalTaskRefactorAuth,
} from "./__fixtures__";
import { buildLaunchContext } from "./composer";
import { defaultContributorRegistry } from "./contributors";
import type { ResolveCtx } from "./types";

const resolveCtx: ResolveCtx = {
	projectId: "project-1",
	signal: new AbortController().signal,
	fetchIssue: async (url) => {
		if (url === githubIssueAuthMiddleware.url) return githubIssueAuthMiddleware;
		if (url === githubIssueTokenRotation.url) return githubIssueTokenRotation;
		throw Object.assign(new Error("not found"), { status: 404 });
	},
	fetchPullRequest: async (url) => {
		if (url === githubPrAuthRewrite.url) return githubPrAuthRewrite;
		throw Object.assign(new Error("not found"), { status: 404 });
	},
	fetchInternalTask: async (id) => {
		if (id === internalTaskRefactorAuth.id) return internalTaskRefactorAuth;
		throw Object.assign(new Error("not found"), { status: 404 });
	},
};

describe("composer + default registry (integration)", () => {
	test("composes a multi-source launch end-to-end", async () => {
		const ctx = await buildLaunchContext(
			{
				projectId: "project-1",
				sources: [
					{
						kind: "user-prompt",
						content: [{ type: "text", text: "refactor the auth middleware" }],
					},
					{ kind: "internal-task", id: internalTaskRefactorAuth.id },
					{ kind: "github-issue", url: githubIssueAuthMiddleware.url },
					{ kind: "github-issue", url: githubIssueTokenRotation.url },
					{ kind: "github-pr", url: githubPrAuthRewrite.url },
					{ kind: "attachment", file: attachmentLogsTxt },
				],
				agent: { id: "claude" },
			},
			{ contributors: defaultContributorRegistry, resolveCtx },
		);

		expect(ctx.failures).toEqual([]);
		expect(ctx.sections.map((s) => s.kind)).toEqual([
			"user-prompt",
			"internal-task",
			"github-issue",
			"github-issue",
			"github-pr",
			"attachment",
		]);
		expect(ctx.taskSlug).toBe(internalTaskRefactorAuth.slug);
	});

	test("missing issue is a non-fatal null (not a failure)", async () => {
		const ctx = await buildLaunchContext(
			{
				projectId: "project-1",
				sources: [
					{ kind: "user-prompt", content: [{ type: "text", text: "hi" }] },
					{
						kind: "github-issue",
						url: "https://github.com/acme/repo/issues/99999",
					},
				],
				agent: { id: "none" },
			},
			{ contributors: defaultContributorRegistry, resolveCtx },
		);
		expect(ctx.sections.map((s) => s.kind)).toEqual(["user-prompt"]);
		expect(ctx.failures).toEqual([]);
	});
});
