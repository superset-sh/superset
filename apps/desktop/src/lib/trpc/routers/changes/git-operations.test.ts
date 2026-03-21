import { describe, expect, test } from "bun:test";
import { isUpstreamMissingError } from "./git-utils";
import {
	getExistingPRHeadRepoUrl,
	resolveRemoteNameForExistingPRHead,
} from "./utils/existing-pr-push-target";

describe("git-operations error handling", () => {
	describe("isUpstreamMissingError", () => {
		const upstreamDeletedMessages = [
			"Your configuration specifies to merge with the ref 'refs/heads/feature-branch' from the remote, but no such ref was fetched.",
			"fatal: couldn't find remote ref refs/heads/deleted-branch",
			"fatal: kitenite/dont-hide-changes-tab cannot be resolved to branch",
			"There is no tracking information for the current branch",
		];

		const otherErrorMessages = [
			"fatal: not a git repository",
			"error: failed to push some refs",
			"CONFLICT (content): Merge conflict in file.ts",
			"fatal: refusing to merge unrelated histories",
		];

		test("detects upstream deleted errors", () => {
			for (const message of upstreamDeletedMessages) {
				expect(isUpstreamMissingError(message)).toBe(true);
			}
		});

		test("does not falsely detect other errors as upstream deleted", () => {
			for (const message of otherErrorMessages) {
				expect(isUpstreamMissingError(message)).toBe(false);
			}
		});
	});

	describe("error message patterns", () => {
		test("commit with no staged changes", () => {
			const message = "nothing to commit, working tree clean";
			expect(message.includes("nothing to commit")).toBe(true);
		});

		test("push rejected - needs pull first", () => {
			const message =
				"error: failed to push some refs to 'origin'\nhint: Updates were rejected because the remote contains work";
			expect(message.includes("failed to push")).toBe(true);
			expect(message.includes("rejected")).toBe(true);
		});

		test("push rejected - no permission", () => {
			const message = "remote: Permission to user/repo.git denied to otheruser";
			expect(message.includes("Permission")).toBe(true);
			expect(message.includes("denied")).toBe(true);
		});

		test("merge conflict during pull", () => {
			const message =
				"CONFLICT (content): Merge conflict in src/file.ts\nAutomatic merge failed";
			expect(message.includes("CONFLICT")).toBe(true);
			expect(message.includes("Merge conflict")).toBe(true);
		});

		test("detached HEAD state", () => {
			const message = "HEAD detached at abc1234";
			expect(message.includes("detached")).toBe(true);
		});

		test("no remote configured", () => {
			const message = "fatal: 'origin' does not appear to be a git repository";
			expect(message.includes("does not appear to be a git repository")).toBe(
				true,
			);
		});
	});
});

describe("sync operation logic", () => {
	test("should push with set-upstream when pull fails due to deleted upstream", () => {
		// This tests the logic flow:
		// 1. Pull fails with "no such ref was fetched"
		// 2. Should fall back to push with --set-upstream

		const pullError = new Error(
			"Your configuration specifies to merge with the ref 'refs/heads/feature' from the remote, but no such ref was fetched.",
		);

		expect(isUpstreamMissingError(pullError.message)).toBe(true);
	});

	test("should re-throw other pull errors", () => {
		const pullError = new Error(
			"CONFLICT (content): Merge conflict in file.ts",
		);

		expect(isUpstreamMissingError(pullError.message)).toBe(false);
	});
});

describe("existing PR push target resolution", () => {
	test("uses the fallback remote for same-repo PRs", () => {
		expect(
			resolveRemoteNameForExistingPRHead({
				remotes: [
					{
						name: "origin",
						fetchUrl: "git@github.com:superset-sh/superset.git",
					},
				],
				pr: {
					isCrossRepository: false,
				},
				fallbackRemote: "origin",
			}),
		).toBe("origin");
	});

	test("matches the existing fork remote for cross-repo PRs", () => {
		expect(
			resolveRemoteNameForExistingPRHead({
				remotes: [
					{
						name: "origin",
						fetchUrl: "git@github.com:superset-sh/superset.git",
					},
					{
						name: "kitenite",
						fetchUrl: "git@github.com:kitenite/superset.git",
						pushUrl: "git@github.com:kitenite/superset.git",
					},
				],
				pr: {
					headRepositoryOwner: "kitenite",
					headRepositoryName: "superset",
					isCrossRepository: true,
				},
				fallbackRemote: "origin",
			}),
		).toBe("kitenite");
	});

	test("returns null when a cross-repo PR remote cannot be found", () => {
		expect(
			resolveRemoteNameForExistingPRHead({
				remotes: [
					{
						name: "origin",
						fetchUrl: "git@github.com:superset-sh/superset.git",
					},
				],
				pr: {
					headRepositoryOwner: "kitenite",
					headRepositoryName: "superset",
					isCrossRepository: true,
				},
				fallbackRemote: "origin",
			}),
		).toBeNull();
	});

	test("builds the PR head repo url for cross-repo PRs", () => {
		expect(
			getExistingPRHeadRepoUrl({
				headRepositoryOwner: "kitenite",
				headRepositoryName: "superset",
				isCrossRepository: true,
			}),
		).toBe("https://github.com/kitenite/superset");
	});
});
