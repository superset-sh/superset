import { describe, expect, test } from "bun:test";
import { useNewWorkspaceDraftStore } from "renderer/stores/new-workspace-draft";
import { resolveNames } from "./resolveNames";

describe("resolveNames", () => {
	test("sanitizes manual names even if submitted before blur", () => {
		expect(
			resolveNames({
				...useNewWorkspaceDraftStore.getState(),
				branchName: "Feature/My Fix?!",
				branchNameEdited: true,
				branchNameFromProvider: false,
			}).branchName,
		).toBe("Feature/My-Fix");
	});
	test("leaves automatic naming enabled when the manual name sanitizes to empty", () => {
		expect(
			resolveNames({
				...useNewWorkspaceDraftStore.getState(),
				branchName: "///?!",
				branchNameEdited: true,
				branchNameFromProvider: false,
			}).branchName,
		).toBeNull();
	});
	test("preserves provider names beyond the manual input segment limit", () => {
		const branchName = `user/${"a".repeat(65)}`;
		expect(
			resolveNames({
				...useNewWorkspaceDraftStore.getState(),
				branchName,
				branchNameEdited: true,
				branchNameFromProvider: true,
			}).branchName,
		).toBe(branchName);
	});
});
