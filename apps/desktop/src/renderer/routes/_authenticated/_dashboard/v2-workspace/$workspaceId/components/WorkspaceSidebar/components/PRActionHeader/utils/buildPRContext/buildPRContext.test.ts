import { describe, expect, test } from "bun:test";
import type { BranchSyncStatus, PRFlowState } from "../getPRFlowState";
import { buildPRContext } from "./buildPRContext";

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

const noPrState = (overrides: Partial<BranchSyncStatus> = {}): PRFlowState => ({
	kind: "no-pr",
	sync: sync(overrides),
});

describe("buildPRContext (no-pr)", () => {
	test("includes branch, base, and publish status", () => {
		const md = buildPRContext(noPrState());
		expect(md).toContain("Current: `feature-x`");
		expect(md).toContain("Base: `main`");
		expect(md).toContain("Published: yes");
	});

	test("flags unpublished branches with publish precondition", () => {
		const md = buildPRContext(noPrState({ hasUpstream: false }));
		expect(md).toContain("Published: no");
		expect(md).toContain("Publish the branch");
	});

	test("flags uncommitted changes", () => {
		const md = buildPRContext(noPrState({ hasUncommitted: true }));
		expect(md).toContain("Uncommitted changes: yes");
		expect(md).toContain("Commit or stash uncommitted changes");
	});

	test("flags unpushed commits when branch has upstream", () => {
		const md = buildPRContext(noPrState({ pushCount: 3 }));
		expect(md).toContain("Commits ahead of upstream: 3");
		expect(md).toContain("Push unpushed commits");
	});

	test("warns when branch is behind upstream", () => {
		const md = buildPRContext(noPrState({ pullCount: 2 }));
		expect(md).toContain("Commits behind upstream: 2");
		expect(md).toContain("behind upstream");
	});

	test("mentions --draft arg handling", () => {
		const md = buildPRContext(noPrState());
		expect(md).toContain("`--draft`");
	});

	test("uses defaultBranch in suggested gh pr create command", () => {
		const md = buildPRContext(noPrState({ defaultBranch: "develop" }));
		expect(md).toContain("gh pr create --base develop");
	});
});

describe("buildPRContext (other states)", () => {
	test("returns stub for non-no-pr states", () => {
		const md = buildPRContext({ kind: "loading" });
		expect(md).toContain("# PR context (loading)");
	});
});
