import { describe, expect, test } from "bun:test";
import { getPushActionCopy } from "./getPushActionCopy";

describe("getPushActionCopy", () => {
	test("shows publish branch copy when no upstream or PR target exists", () => {
		expect(
			getPushActionCopy({
				hasUpstream: false,
				pushCount: 0,
			}),
		).toEqual({
			label: "Publish Branch",
			menuLabel: "Publish Branch",
			tooltip: "Publish branch to remote",
		});
	});

	test("shows generic push copy for tracked branches without a PR target", () => {
		expect(
			getPushActionCopy({
				hasUpstream: true,
				pushCount: 2,
			}),
		).toEqual({
			label: "Push",
			menuLabel: "Push",
			tooltip: "Push 2 commits",
		});
	});

	test("shows PR-specific push copy when an attached PR target exists", () => {
		expect(
			getPushActionCopy({
				hasUpstream: true,
				pushCount: 1,
				pullRequest: {
					headRefName: "feature/pr-branch",
					headRepositoryOwner: "Kitenite",
				},
			}),
		).toEqual({
			label: "Push to PR",
			menuLabel: "Push to PR",
			tooltip: "Push 1 commit to Kitenite:feature/pr-branch",
		});
	});
});
