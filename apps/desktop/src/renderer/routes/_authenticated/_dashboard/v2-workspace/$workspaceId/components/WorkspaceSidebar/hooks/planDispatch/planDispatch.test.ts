import { describe, expect, test } from "bun:test";
import type {
	BranchSyncStatus,
	PRFlowState,
	PullRequest,
} from "../../components/PRActionHeader/utils/getPRFlowState";
import { formatInlinedPRPrompt, planDispatch } from "./planDispatch";

const sync: BranchSyncStatus = {
	hasRepo: true,
	hasUpstream: true,
	pushCount: 1,
	pullCount: 0,
	isDefaultBranch: false,
	isDetached: false,
	hasUncommitted: false,
	currentBranch: "feature-x",
	defaultBranch: "main",
};

const noPrState: PRFlowState = { kind: "no-pr", sync };

const prFixture: PullRequest = {
	number: 42,
	url: "https://github.com/org/repo/pull/42",
	title: "Feature X",
	body: null,
	state: "open",
	isDraft: false,
	reviewDecision: null,
	mergeable: "unknown",
	headRefName: "feature-x",
	baseRefName: "main",
	updatedAt: "",
	checks: [],
	repoOwner: "org",
	repoName: "repo",
};

const prExistsState: PRFlowState = {
	kind: "pr-exists",
	pr: prFixture,
	sync,
};

describe("planDispatch", () => {
	test("no-pr without draft → /pr/create-pr prompt", () => {
		const plan = planDispatch(noPrState, { draft: false });
		expect(plan).not.toBeNull();
		expect(plan?.prompt).toBe("/pr/create-pr");
	});

	test("no-pr with draft → /pr/create-pr --draft", () => {
		const plan = planDispatch(noPrState, { draft: true });
		expect(plan?.prompt).toBe("/pr/create-pr --draft");
	});

	test("attaches pr-context.md as base64 data URL", () => {
		const plan = planDispatch(noPrState, { draft: false });
		expect(plan?.attachment.filename).toBe("pr-context.md");
		expect(plan?.attachment.mediaType).toBe("text/markdown");
		expect(plan?.attachment.data.startsWith("data:text/markdown;base64,")).toBe(
			true,
		);

		const base64 = plan?.attachment.data.replace(
			"data:text/markdown;base64,",
			"",
		);
		const decoded = Buffer.from(base64 ?? "", "base64").toString("utf-8");
		expect(decoded).toContain("# PR context");
		expect(decoded).toContain("Current: `feature-x`");
	});

	test("returns null for states outside MVP scope", () => {
		expect(planDispatch({ kind: "loading" }, { draft: false })).toBeNull();
		expect(
			planDispatch({ kind: "busy", pr: null }, { draft: false }),
		).toBeNull();
		expect(
			planDispatch(
				{ kind: "unavailable", reason: "default-branch" },
				{ draft: false },
			),
		).toBeNull();
	});

	test("pr-exists → /pr/update-pr prompt", () => {
		const plan = planDispatch(prExistsState, { draft: false });
		expect(plan).not.toBeNull();
		expect(plan?.prompt).toBe("/pr/update-pr");
	});

	test("pr-exists attachment carries PR number + branch", () => {
		const plan = planDispatch(prExistsState, { draft: false });
		expect(plan?.attachment.filename).toBe("pr-context.md");
		const base64 = plan?.attachment.data.replace(
			"data:text/markdown;base64,",
			"",
		);
		const decoded = Buffer.from(base64 ?? "", "base64").toString("utf-8");
		expect(decoded).toContain("# PR context");
		expect(decoded).toContain("#42");
		expect(decoded).toContain("Current: `feature-x`");
	});

	test("projectPrompt is appended as a 'Project guidelines' section", () => {
		const plan = planDispatch(noPrState, {
			draft: false,
			projectPrompt: "Title format: feat(scope): description.",
		});
		expect(plan?.contextMarkdown).toContain("## Project guidelines");
		expect(plan?.contextMarkdown).toContain(
			"Title format: feat(scope): description.",
		);
	});

	test("empty/whitespace projectPrompt skips the section", () => {
		const plan = planDispatch(noPrState, {
			draft: false,
			projectPrompt: "   \n  \n",
		});
		expect(plan?.contextMarkdown).not.toContain("Project guidelines");
	});
});

function requirePlan(plan: ReturnType<typeof planDispatch>) {
	if (!plan) throw new Error("planDispatch returned null in test");
	return plan;
}

describe("formatInlinedPRPrompt", () => {
	test("composes slash command + heading + context markdown", () => {
		const plan = requirePlan(planDispatch(noPrState, { draft: false }));
		const text = formatInlinedPRPrompt(plan);
		expect(text).toContain("/pr/create-pr");
		expect(text).toContain("**pr-context.md**");
		expect(text).toContain("# PR context");
		// The slash command must come first so the agent recognises it as
		// the skill invocation before parsing the context.
		const slashIdx = text.indexOf("/pr/create-pr");
		const headingIdx = text.indexOf("**pr-context.md**");
		const contextIdx = text.indexOf("# PR context");
		expect(slashIdx).toBeLessThan(headingIdx);
		expect(headingIdx).toBeLessThan(contextIdx);
	});

	test("forwards projectPrompt through into the inlined body", () => {
		const plan = requirePlan(
			planDispatch(noPrState, {
				draft: false,
				projectPrompt: "Title format: feat(scope): description.",
			}),
		);
		const text = formatInlinedPRPrompt(plan);
		expect(text).toContain("## Project guidelines");
		expect(text).toContain("Title format: feat(scope): description.");
	});

	test("pr-exists state inlines /pr/update-pr", () => {
		const plan = requirePlan(planDispatch(prExistsState, { draft: false }));
		const text = formatInlinedPRPrompt(plan);
		expect(text.startsWith("/pr/update-pr")).toBe(true);
		expect(text).toContain("#42");
	});
});
