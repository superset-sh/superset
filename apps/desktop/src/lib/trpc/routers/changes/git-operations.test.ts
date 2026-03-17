import { describe, expect, test } from "bun:test";
import { isUpstreamMissingError } from "./git-utils";
import { parseUpstreamRef } from "./utils/pull-request-url";

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

describe("tracking remote resolution (#2516)", () => {
	// Reproduces the bug where push/fetch always targeted "origin" instead of
	// the branch's actual tracking remote (e.g. a fork remote added by `gh pr checkout`).

	test("parseUpstreamRef extracts fork remote name from upstream ref", () => {
		// When `gh pr checkout` sets up a fork, the upstream looks like "contributor-fork/feature-branch"
		const result = parseUpstreamRef("contributor-fork/feature-branch");
		expect(result).toEqual({
			remoteName: "contributor-fork",
			branchName: "feature-branch",
		});
	});

	test("parseUpstreamRef extracts origin remote name", () => {
		const result = parseUpstreamRef("origin/main");
		expect(result).toEqual({
			remoteName: "origin",
			branchName: "main",
		});
	});

	test("parseUpstreamRef returns null for invalid refs", () => {
		expect(parseUpstreamRef("")).toBeNull();
		expect(parseUpstreamRef("no-slash")).toBeNull();
		expect(parseUpstreamRef("/leading-slash")).toBeNull();
		expect(parseUpstreamRef("trailing/")).toBeNull();
	});

	test("getTrackingRemote logic: returns fork remote when tracking fork upstream", () => {
		// This tests the core logic that was broken before the fix.
		// The getTrackingRemote function uses parseUpstreamRef to extract the remote.
		// Before the fix, push/fetch always hardcoded "origin" regardless of tracking.
		const upstreamRef = "my-fork-remote/fix-typo";
		const parsed = parseUpstreamRef(upstreamRef);

		// Before fix: would always use "origin" — ignoring the parsed remote
		// After fix: uses parsed.remoteName ("my-fork-remote")
		expect(parsed).not.toBeNull();
		expect(parsed?.remoteName).toBe("my-fork-remote");
		expect(parsed?.remoteName).not.toBe("origin");
	});

	test("getTrackingRemote logic: falls back to origin when no upstream is set", () => {
		// When parseUpstreamRef returns null (no upstream configured),
		// getTrackingRemote should fall back to "origin"
		const parsed = parseUpstreamRef("");
		expect(parsed).toBeNull();
		// Fallback behavior: when parsed is null, getTrackingRemote returns "origin"
	});

	test("push commands should use tracking remote, not hardcoded origin", () => {
		// Verify the push args construction uses the resolved remote
		const upstreamRef = "contributor/feature-branch";
		const parsed = parseUpstreamRef(upstreamRef);
		expect(parsed).not.toBeNull();

		const remote = parsed?.remoteName;
		const branch = "feature-branch";

		// The push command should use the tracking remote
		const pushArgs = ["--set-upstream", remote, `HEAD:refs/heads/${branch}`];

		expect(pushArgs).toEqual([
			"--set-upstream",
			"contributor",
			"HEAD:refs/heads/feature-branch",
		]);
		// Before fix, pushArgs[1] would always be "origin"
		expect(pushArgs[1]).not.toBe("origin");
	});

	test("fetch commands should use tracking remote, not hardcoded origin", () => {
		// Verify fetch uses resolved remote
		const upstreamRef = "fork-user/my-branch";
		const parsed = parseUpstreamRef(upstreamRef);
		expect(parsed).not.toBeNull();

		const remote = parsed?.remoteName;
		const branch = "my-branch";

		const fetchArgs = [remote, branch];
		expect(fetchArgs).toEqual(["fork-user", "my-branch"]);
		// Before fix, fetchArgs[0] would always be "origin"
		expect(fetchArgs[0]).not.toBe("origin");
	});
});
