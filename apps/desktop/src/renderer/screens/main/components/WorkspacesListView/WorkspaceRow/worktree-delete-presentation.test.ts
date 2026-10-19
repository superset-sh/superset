import { describe, expect, test } from "bun:test";
import { getWorktreeDeletePresentation } from "./worktree-delete-presentation";

describe("getWorktreeDeletePresentation", () => {
	test("treats Superset-created worktrees as destructive deletes", () => {
		expect(getWorktreeDeletePresentation(true)).toEqual({
			actionLabel: "Delete worktree",
			actionVerb: "Delete",
			isImported: false,
			isUnknown: false,
			removesFilesFromDisk: true,
		});
	});

	test("treats imported worktrees as non-destructive removes", () => {
		expect(getWorktreeDeletePresentation(false)).toEqual({
			actionLabel: "Remove worktree",
			actionVerb: "Remove",
			isImported: true,
			isUnknown: false,
			removesFilesFromDisk: false,
		});
	});

	test("treats unknown ownership as non-destructive remove wording", () => {
		expect(getWorktreeDeletePresentation(null)).toEqual({
			actionLabel: "Remove worktree",
			actionVerb: "Remove",
			isImported: false,
			isUnknown: true,
			removesFilesFromDisk: false,
		});
	});
});
