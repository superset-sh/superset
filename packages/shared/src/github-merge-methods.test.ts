import { describe, expect, test } from "bun:test";
import {
	isGitHubMergeMethodDisabled,
	normalizeGitHubRestMergeCapabilities,
} from "./github-merge-methods";

describe("GitHub merge method capabilities", () => {
	test("normalizes REST capability field names", () => {
		expect(
			normalizeGitHubRestMergeCapabilities({
				allow_merge_commit: true,
				allow_rebase_merge: false,
				allow_squash_merge: true,
			}),
		).toEqual({
			allowMergeCommit: true,
			allowRebaseMerge: false,
			allowSquashMerge: true,
		});
	});

	test("only treats an explicitly disabled capability as disabled", () => {
		const capabilities = normalizeGitHubRestMergeCapabilities({
			allow_rebase_merge: false,
		});

		expect(isGitHubMergeMethodDisabled(capabilities, "rebase")).toBe(true);
		expect(isGitHubMergeMethodDisabled(capabilities, "merge")).toBe(false);
		expect(isGitHubMergeMethodDisabled(null, "squash")).toBe(false);
	});
});
