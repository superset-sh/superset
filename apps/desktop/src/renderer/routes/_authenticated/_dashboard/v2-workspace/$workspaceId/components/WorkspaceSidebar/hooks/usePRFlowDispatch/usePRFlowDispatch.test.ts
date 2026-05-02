import { describe, expect, test } from "bun:test";
import type {
	BranchSyncStatus,
	PRFlowState,
} from "../../components/PRActionHeader/utils/getPRFlowState";
import { planDispatch } from "./usePRFlowDispatch";

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
});
