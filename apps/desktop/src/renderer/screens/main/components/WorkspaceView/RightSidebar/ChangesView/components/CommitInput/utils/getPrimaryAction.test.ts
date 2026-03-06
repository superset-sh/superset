import { describe, expect, test } from "bun:test";
import { getPrimaryAction } from "./getPrimaryAction";

describe("getPrimaryAction", () => {
	test("prioritizes commit when commit is possible", () => {
		const state = getPrimaryAction({
			canCommit: true,
			hasStagedChanges: true,
			isPending: false,
			pushCount: 3,
			pullCount: 2,
			hasUpstream: true,
			hasExistingPR: false,
		});

		expect(state.action).toBe("commit");
		expect(state.label).toBe("Commit");
		expect(state.tooltip).toBe("Commit staged changes");
		expect(state.disabled).toBe(false);
	});

	test("shows sync when both push and pull are pending", () => {
		const state = getPrimaryAction({
			canCommit: false,
			hasStagedChanges: false,
			isPending: false,
			pushCount: 2,
			pullCount: 1,
			hasUpstream: true,
			hasExistingPR: false,
		});

		expect(state.action).toBe("sync");
		expect(state.label).toBe("Sync");
		expect(state.tooltip).toBe("Pull 1, push 2");
	});

	test("shows push when only push is pending", () => {
		const state = getPrimaryAction({
			canCommit: false,
			hasStagedChanges: false,
			isPending: false,
			pushCount: 2,
			pullCount: 0,
			hasUpstream: true,
			hasExistingPR: false,
		});

		expect(state.action).toBe("push");
		expect(state.label).toBe("Push");
		expect(state.tooltip).toBe("Push 2 commits");
	});

	test("shows pull when only pull is pending", () => {
		const state = getPrimaryAction({
			canCommit: false,
			hasStagedChanges: false,
			isPending: false,
			pushCount: 0,
			pullCount: 2,
			hasUpstream: true,
			hasExistingPR: false,
		});

		expect(state.action).toBe("pull");
		expect(state.label).toBe("Pull");
		expect(state.tooltip).toBe("Pull 2 commits");
	});

	test("shows publish branch for unpublished branch without PR", () => {
		const state = getPrimaryAction({
			canCommit: false,
			hasStagedChanges: false,
			isPending: false,
			pushCount: 0,
			pullCount: 0,
			hasUpstream: false,
			hasExistingPR: false,
		});

		expect(state.action).toBe("push");
		expect(state.label).toBe("Publish Branch");
		expect(state.tooltip).toBe("Publish branch to remote");
	});

	test("shows push label for unpublished branch with existing PR", () => {
		const state = getPrimaryAction({
			canCommit: false,
			hasStagedChanges: false,
			isPending: false,
			pushCount: 0,
			pullCount: 0,
			hasUpstream: false,
			hasExistingPR: true,
		});

		expect(state.action).toBe("push");
		expect(state.label).toBe("Push");
		expect(state.tooltip).toBe("Push branch changes");
	});

	test("falls back to disabled commit state", () => {
		const state = getPrimaryAction({
			canCommit: false,
			hasStagedChanges: false,
			isPending: false,
			pushCount: 0,
			pullCount: 0,
			hasUpstream: true,
			hasExistingPR: false,
		});

		expect(state.action).toBe("commit");
		expect(state.label).toBe("Commit");
		expect(state.disabled).toBe(true);
		expect(state.tooltip).toBe("No staged changes");
	});
});
