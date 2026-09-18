import { describe, expect, test } from "bun:test";
import {
	branchPrefixCollides,
	DEFAULT_BRANCH_SEGMENT_MAX_LENGTH,
	deduplicateBranchName,
	resolveBranchPrefix,
	sanitizeAuthorPrefix,
	sanitizeBranchName,
	sanitizeBranchNameWithMaxLength,
	sanitizeSegment,
	truncateBranchName,
} from "./branch";

describe("sanitizeSegment", () => {
	test("lowercases and trims", () => {
		expect(sanitizeSegment("  Hello World  ")).toBe("hello-world");
	});

	test("replaces spaces with hyphens", () => {
		expect(sanitizeSegment("Hello World")).toBe("hello-world");
	});

	test("removes special characters", () => {
		expect(sanitizeSegment("Hello's World!")).toBe("hellos-world");
	});

	test("preserves underscores", () => {
		expect(sanitizeSegment("hello_world")).toBe("hello_world");
	});

	test("preserves dots", () => {
		expect(sanitizeSegment("v1.0.0")).toBe("v1.0.0");
	});

	test("preserves plus signs", () => {
		expect(sanitizeSegment("c++fix")).toBe("c++fix");
	});

	test("preserves at signs", () => {
		expect(sanitizeSegment("user@feature")).toBe("user@feature");
	});

	test("strips @{ sequence", () => {
		expect(sanitizeSegment("test@{0}")).toBe("test@0");
	});

	test("collapses consecutive dots", () => {
		expect(sanitizeSegment("hello..world")).toBe("hello.world");
	});

	test("removes .lock suffix", () => {
		expect(sanitizeSegment("hello.lock")).toBe("hello");
	});

	test("collapses multiple hyphens", () => {
		expect(sanitizeSegment("hello--world")).toBe("hello-world");
	});

	test("removes leading/trailing hyphens and dots", () => {
		expect(sanitizeSegment("-hello-")).toBe("hello");
		expect(sanitizeSegment(".hello.")).toBe("hello");
	});

	test("respects maxLength", () => {
		expect(sanitizeSegment("hello-world", 5)).toBe("hello");
	});

	test("can preserve case when requested", () => {
		expect(sanitizeSegment("  Hello World  ", 50, { preserveCase: true })).toBe(
			"Hello-World",
		);
	});

	test("handles empty string", () => {
		expect(sanitizeSegment("")).toBe("");
	});
});

describe("sanitizeAuthorPrefix", () => {
	test("preserves case and trims", () => {
		expect(sanitizeAuthorPrefix("  John Doe  ")).toBe("John-Doe");
	});

	test("replaces spaces with hyphens", () => {
		expect(sanitizeAuthorPrefix("John Doe")).toBe("John-Doe");
	});

	test("preserves GitHub username case", () => {
		expect(sanitizeAuthorPrefix("Kitenite")).toBe("Kitenite");
	});

	test("removes special characters but keeps underscores and dots", () => {
		expect(sanitizeAuthorPrefix("John's Name!")).toBe("Johns-Name");
		expect(sanitizeAuthorPrefix("user_name")).toBe("user_name");
	});

	test("collapses multiple hyphens", () => {
		expect(sanitizeAuthorPrefix("John--Doe")).toBe("John-Doe");
	});

	test("removes leading/trailing hyphens", () => {
		expect(sanitizeAuthorPrefix("-John-")).toBe("John");
	});

	test("handles empty string", () => {
		expect(sanitizeAuthorPrefix("")).toBe("");
	});
});

describe("sanitizeBranchName", () => {
	test("sanitizes single segment", () => {
		expect(sanitizeBranchName("My Feature")).toBe("my-feature");
	});

	test("sanitizes multiple segments", () => {
		expect(sanitizeBranchName("john/My Feature")).toBe("john/my-feature");
	});

	test("removes empty segments", () => {
		expect(sanitizeBranchName("john//feature")).toBe("john/feature");
	});

	test("handles prefix with special characters", () => {
		expect(sanitizeBranchName("John's/Feature!")).toBe("johns/feature");
	});

	test("preserves underscores and dots in branch names", () => {
		expect(sanitizeBranchName("user/fix_bug")).toBe("user/fix_bug");
		expect(sanitizeBranchName("release/v1.0.0")).toBe("release/v1.0.0");
	});

	test("preserves plus and at signs", () => {
		expect(sanitizeBranchName("user/c++fix")).toBe("user/c++fix");
		expect(sanitizeBranchName("user@org/feature")).toBe("user@org/feature");
	});

	test("strips git-forbidden characters", () => {
		expect(sanitizeBranchName("feat/test~1")).toBe("feat/test1");
		expect(sanitizeBranchName("feat/test^2")).toBe("feat/test2");
		expect(sanitizeBranchName("feat/test:foo")).toBe("feat/testfoo");
		expect(sanitizeBranchName("feat/test?foo")).toBe("feat/testfoo");
		expect(sanitizeBranchName("feat/test*foo")).toBe("feat/testfoo");
		expect(sanitizeBranchName("feat/test[foo")).toBe("feat/testfoo");
		expect(sanitizeBranchName("feat/test\\foo")).toBe("feat/testfoo");
	});

	test("handles empty string", () => {
		expect(sanitizeBranchName("")).toBe("");
	});

	test("handles only slashes", () => {
		expect(sanitizeBranchName("///")).toBe("");
	});
});

describe("truncateBranchName", () => {
	test("truncates to max length", () => {
		expect(truncateBranchName("feature/my-very-long-branch", 8)).toBe(
			"feature",
		);
	});

	test("drops trailing slash after truncation", () => {
		expect(truncateBranchName("feature/test", 8)).toBe("feature");
	});
});

describe("sanitizeBranchNameWithMaxLength", () => {
	test("sanitizes and then truncates", () => {
		expect(
			sanitizeBranchNameWithMaxLength("Feature Name/With Spaces", 16),
		).toBe("feature-name/wit");
	});

	test("preserves mixed-case first segments for user-provided branches", () => {
		expect(
			sanitizeBranchNameWithMaxLength("Kitenite/My Feature", 100, {
				preserveFirstSegmentCase: true,
			}),
		).toBe("Kitenite/my-feature");
	});

	test("preserves case for single-segment manual branches", () => {
		expect(
			sanitizeBranchNameWithMaxLength("Fix_Bug", 100, {
				preserveFirstSegmentCase: true,
			}),
		).toBe("Fix_Bug");
	});
});

describe("resolveBranchPrefix", () => {
	test("keeps slashes in a custom prefix", () => {
		expect(
			resolveBranchPrefix({ mode: "custom", customPrefix: "user/my-name" }),
		).toBe("user/my-name");
	});

	test("preserves case so the saved prefix survives branch creation", () => {
		expect(
			resolveBranchPrefix({ mode: "custom", customPrefix: "User/My-Team" }),
		).toBe("User/My-Team");
	});

	test("sanitizes each segment of a custom prefix", () => {
		expect(
			resolveBranchPrefix({ mode: "custom", customPrefix: "my team/a b!" }),
		).toBe("my-team/a-b");
	});

	test("returns null for a custom prefix that sanitizes away", () => {
		expect(resolveBranchPrefix({ mode: "custom", customPrefix: "///" })).toBe(
			null,
		);
	});

	test("returns null when custom mode has no prefix", () => {
		expect(resolveBranchPrefix({ mode: "custom", customPrefix: null })).toBe(
			null,
		);
	});

	test("caps a custom prefix at half the branch-name budget", () => {
		expect(
			resolveBranchPrefix({
				mode: "custom",
				customPrefix: `user/${"x".repeat(60)}`,
			}),
		).toHaveLength(50);
	});

	// Capping per segment instead of in total would let this through at ~400
	// characters. Nothing trims `${prefix}/${slug}` before `git worktree add`,
	// so the ceiling has to hold here no matter how many segments are typed.
	test("bounds a custom prefix however many segments it has", () => {
		const many = Array.from({ length: 8 }, () => "x".repeat(60)).join("/");
		const resolved = resolveBranchPrefix({
			mode: "custom",
			customPrefix: many,
		});
		expect(resolved?.length).toBeLessThanOrEqual(50);
	});

	test("keeps author and github prefixes to a single segment", () => {
		expect(
			resolveBranchPrefix({ mode: "author", authorPrefix: "Ada/Lovelace" }),
		).toBe("AdaLovelace");
		expect(
			resolveBranchPrefix({ mode: "github", githubUsername: "Ada-L" }),
		).toBe("Ada-L");
	});

	test("falls back to the author prefix when github has no username", () => {
		expect(resolveBranchPrefix({ mode: "github", authorPrefix: "Ada" })).toBe(
			"Ada",
		);
	});

	test("returns null for none and unset modes", () => {
		expect(resolveBranchPrefix({ mode: "none" })).toBe(null);
		expect(resolveBranchPrefix({ mode: null })).toBe(null);
	});

	// The settings inputs persist this sanitizer's output directly. Resolving
	// that value again has to be a no-op, or the prefix shown in settings and
	// the one the branch is created with drift apart.
	test("resolving an already-saved custom prefix changes nothing", () => {
		const saved = sanitizeBranchNameWithMaxLength(
			"User/My Team",
			DEFAULT_BRANCH_SEGMENT_MAX_LENGTH,
			{ preserveCase: true },
		);
		expect(saved).toBe("User/My-Team");
		expect(resolveBranchPrefix({ mode: "custom", customPrefix: saved })).toBe(
			saved,
		);
	});
});

describe("branchPrefixCollides", () => {
	test("detects an exact match", () => {
		expect(branchPrefixCollides("user", ["main", "user"])).toBe(true);
	});

	test("detects an ancestor that is already a branch", () => {
		expect(branchPrefixCollides("user/team", ["main", "user"])).toBe(true);
	});

	test("detects an ancestor several levels up", () => {
		expect(branchPrefixCollides("a/b/c", ["a"])).toBe(true);
	});

	test("allows a prefix whose ancestors are free", () => {
		expect(branchPrefixCollides("user/team", ["main", "user-team"])).toBe(
			false,
		);
	});

	test("does not treat a descendant branch as a collision", () => {
		expect(branchPrefixCollides("user", ["user/team/task"])).toBe(false);
	});

	test("compares case-insensitively", () => {
		expect(branchPrefixCollides("User/Team", ["user"])).toBe(true);
	});
});

describe("deduplicateBranchName", () => {
	test("returns candidate when no collision exists", () => {
		expect(deduplicateBranchName("feature/test", ["main", "develop"])).toBe(
			"feature/test",
		);
	});

	test("appends numeric suffix when branch exists", () => {
		expect(deduplicateBranchName("feature/test", ["feature/test"])).toBe(
			"feature/test-1",
		);
	});

	test("increments suffix to next available value", () => {
		expect(
			deduplicateBranchName("feature/test", [
				"feature/test",
				"feature/test-1",
				"feature/test-2",
			]),
		).toBe("feature/test-3");
	});

	test("treats existing names case-insensitively", () => {
		expect(deduplicateBranchName("Feature/Test", ["feature/test"])).toBe(
			"Feature/Test-1",
		);
	});

	test("reuses base segment when candidate already ends with a suffix", () => {
		expect(
			deduplicateBranchName("feature/test-2", [
				"feature/test",
				"feature/test-1",
				"feature/test-2",
			]),
		).toBe("feature/test-3");
	});
});
