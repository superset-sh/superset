import { describe, expect, test } from "bun:test";
import { resolveWorkspaceBranchDraft } from "./workspaceBranchDraft";

describe("resolveWorkspaceBranchDraft", () => {
	test("uses sanitized title when branch name is not manually edited", () => {
		expect(
			resolveWorkspaceBranchDraft({
				title: "  Fix branch name generation in modal  ",
				branchName: "",
				branchNameEdited: false,
			}),
		).toEqual({
			branchSlug: "fix-branch-name-generation-in-modal",
			applyPrefix: true,
		});
	});

	test("uses sanitized custom branch name when manually edited", () => {
		expect(
			resolveWorkspaceBranchDraft({
				title: "ignored title",
				branchName: "Feature/Use Better Branch",
				branchNameEdited: true,
			}),
		).toEqual({
			branchSlug: "feature/use-better-branch",
			applyPrefix: false,
		});
	});

	test("returns empty branch slug when source input is blank", () => {
		expect(
			resolveWorkspaceBranchDraft({
				title: "   ",
				branchName: "",
				branchNameEdited: false,
			}),
		).toEqual({
			branchSlug: "",
			applyPrefix: true,
		});
	});
});
