import { describe, expect, test } from "bun:test";
import {
	type BranchSyncStatus,
	getPRFlowState,
	type PullRequest,
	selectActionButton,
	selectPRLink,
	selectStatusBadge,
} from "./getPRFlowState";

const sync = (overrides: Partial<BranchSyncStatus> = {}): BranchSyncStatus => ({
	hasRepo: true,
	hasUpstream: true,
	pushCount: 0,
	pullCount: 0,
	isDefaultBranch: false,
	isDetached: false,
	hasUncommitted: false,
	currentBranch: "feature-x",
	defaultBranch: "main",
	...overrides,
});

const pr = (overrides: Partial<PullRequest> = {}): PullRequest => ({
	number: 42,
	url: "https://github.com/org/repo/pull/42",
	title: "Feature X",
	body: null,
	state: "open",
	isDraft: false,
	reviewDecision: null,
	mergeable: "unknown",
	headRefName: "feature-x",
	updatedAt: "",
	checks: [],
	repoOwner: "org",
	repoName: "repo",
	...overrides,
});

describe("getPRFlowState", () => {
	test("error when load failed and no data", () => {
		const state = getPRFlowState({
			pr: null,
			sync: null,
			isLoading: false,
			isAgentRunning: false,
			loadError: new Error("boom"),
		});
		expect(state).toEqual({ kind: "error", pr: null, message: "boom" });
	});

	test("loading when first fetch hasn't returned", () => {
		const state = getPRFlowState({
			pr: null,
			sync: null,
			isLoading: true,
			isAgentRunning: false,
			loadError: null,
		});
		expect(state.kind).toBe("loading");
	});

	test("busy overrides actionable states when agent is running", () => {
		const state = getPRFlowState({
			pr: null,
			sync: sync(),
			isLoading: false,
			isAgentRunning: true,
			loadError: null,
		});
		expect(state.kind).toBe("busy");
	});

	test("unavailable: no-repo when hasRepo is false", () => {
		const state = getPRFlowState({
			pr: null,
			sync: sync({ hasRepo: false }),
			isLoading: false,
			isAgentRunning: false,
			loadError: null,
		});
		expect(state).toEqual({ kind: "unavailable", reason: "no-repo" });
	});

	test("unavailable: detached-head", () => {
		const state = getPRFlowState({
			pr: null,
			sync: sync({ isDetached: true, currentBranch: null }),
			isLoading: false,
			isAgentRunning: false,
			loadError: null,
		});
		expect(state).toEqual({ kind: "unavailable", reason: "detached-head" });
	});

	test("unavailable: default-branch", () => {
		const state = getPRFlowState({
			pr: null,
			sync: sync({ isDefaultBranch: true, currentBranch: "main" }),
			isLoading: false,
			isAgentRunning: false,
			loadError: null,
		});
		expect(state).toEqual({ kind: "unavailable", reason: "default-branch" });
	});

	test("no-pr when on feature branch without a PR", () => {
		const s = sync({ pushCount: 2 });
		const state = getPRFlowState({
			pr: null,
			sync: s,
			isLoading: false,
			isAgentRunning: false,
			loadError: null,
		});
		expect(state).toEqual({ kind: "no-pr", sync: s });
	});

	test("pr-exists when a PR is present", () => {
		const p = pr();
		const state = getPRFlowState({
			pr: p,
			sync: sync(),
			isLoading: false,
			isAgentRunning: false,
			loadError: null,
		});
		expect(state.kind).toBe("pr-exists");
		if (state.kind === "pr-exists") expect(state.pr).toBe(p);
	});
});

describe("selectActionButton", () => {
	test("no-pr → create-pr-dropdown", () => {
		expect(selectActionButton({ kind: "no-pr", sync: sync() })).toEqual({
			kind: "create-pr-dropdown",
		});
	});
	test("busy → cancel-busy", () => {
		expect(selectActionButton({ kind: "busy", pr: null })).toEqual({
			kind: "cancel-busy",
		});
	});
	test("error → retry", () => {
		expect(
			selectActionButton({ kind: "error", pr: null, message: "x" }),
		).toEqual({ kind: "retry" });
	});
	test("loading → hidden", () => {
		expect(selectActionButton({ kind: "loading" })).toEqual({ kind: "hidden" });
	});
	test("pr-exists → hidden (post-PR actions land later)", () => {
		expect(
			selectActionButton({ kind: "pr-exists", pr: pr(), sync: sync() }),
		).toEqual({ kind: "hidden" });
	});
	test("unavailable → disabled-tooltip with reason", () => {
		expect(
			selectActionButton({ kind: "unavailable", reason: "default-branch" }),
		).toMatchObject({ kind: "disabled-tooltip" });
	});
});

describe("selectPRLink", () => {
	test("none when no PR", () => {
		expect(selectPRLink({ kind: "no-pr", sync: sync() })).toEqual({
			kind: "none",
		});
	});
	test("open PR link", () => {
		const p = pr({ number: 9, state: "open", isDraft: false });
		expect(selectPRLink({ kind: "pr-exists", pr: p, sync: null })).toEqual({
			kind: "pr-link",
			state: "open",
			number: 9,
			url: p.url,
		});
	});
	test("draft PR link takes priority over state", () => {
		const p = pr({ isDraft: true, state: "open" });
		expect(
			selectPRLink({ kind: "pr-exists", pr: p, sync: null }),
		).toMatchObject({ state: "draft" });
	});
	test("merged / closed PR links", () => {
		expect(
			selectPRLink({
				kind: "pr-exists",
				pr: pr({ state: "merged" }),
				sync: null,
			}),
		).toMatchObject({ state: "merged" });
		expect(
			selectPRLink({
				kind: "pr-exists",
				pr: pr({ state: "closed" }),
				sync: null,
			}),
		).toMatchObject({ state: "closed" });
	});
	test("PR link still visible during busy/error when PR known", () => {
		const p = pr();
		expect(selectPRLink({ kind: "busy", pr: p })).toMatchObject({
			kind: "pr-link",
		});
	});
});

describe("selectStatusBadge (no-pr variants)", () => {
	test("'Not published' when no upstream", () => {
		expect(
			selectStatusBadge({
				kind: "no-pr",
				sync: sync({ hasUpstream: false }),
			}),
		).toBe("Not published");
	});
	test("'Diverged' when both push and pull", () => {
		expect(
			selectStatusBadge({
				kind: "no-pr",
				sync: sync({ pushCount: 1, pullCount: 1 }),
			}),
		).toBe("Diverged");
	});
	test("'N commits to push' with singular/plural", () => {
		expect(
			selectStatusBadge({ kind: "no-pr", sync: sync({ pushCount: 1 }) }),
		).toBe("1 commit to push");
		expect(
			selectStatusBadge({ kind: "no-pr", sync: sync({ pushCount: 3 }) }),
		).toBe("3 commits to push");
	});
	test("'Uncommitted changes' when dirty and no pending push/pull", () => {
		expect(
			selectStatusBadge({
				kind: "no-pr",
				sync: sync({ hasUncommitted: true }),
			}),
		).toBe("Uncommitted changes");
	});
	test("'Ready' when clean and in-sync", () => {
		expect(selectStatusBadge({ kind: "no-pr", sync: sync() })).toBe("Ready");
	});
});
