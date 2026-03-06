import { describe, expect, test } from "bun:test";
import { shouldAutoCreatePRAfterPublish } from "./auto-create-pr-after-publish";

describe("shouldAutoCreatePRAfterPublish", () => {
	test("auto-creates after publishing on a non-default branch without an existing PR", () => {
		expect(
			shouldAutoCreatePRAfterPublish({
				hasExistingPR: false,
				isDefaultBranch: false,
			}),
		).toBe(true);
	});

	test("does not auto-create on the default branch", () => {
		expect(
			shouldAutoCreatePRAfterPublish({
				hasExistingPR: false,
				isDefaultBranch: true,
			}),
		).toBe(false);
	});

	test("does not auto-create when a PR already exists", () => {
		expect(
			shouldAutoCreatePRAfterPublish({
				hasExistingPR: true,
				isDefaultBranch: false,
			}),
		).toBe(false);
	});
});
