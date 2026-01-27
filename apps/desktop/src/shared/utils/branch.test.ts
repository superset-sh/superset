import { describe, expect, test } from "bun:test";
import {
	findBranchPathConflict,
	sanitizeAuthorPrefix,
	sanitizeBranchName,
	sanitizeSegment,
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

	test("collapses multiple hyphens", () => {
		expect(sanitizeSegment("hello--world")).toBe("hello-world");
	});

	test("removes leading/trailing hyphens", () => {
		expect(sanitizeSegment("-hello-")).toBe("hello");
	});

	test("respects maxLength", () => {
		expect(sanitizeSegment("hello-world", 5)).toBe("hello");
	});

	test("handles empty string", () => {
		expect(sanitizeSegment("")).toBe("");
	});
});

describe("sanitizeAuthorPrefix", () => {
	test("lowercases and trims", () => {
		expect(sanitizeAuthorPrefix("  John Doe  ")).toBe("john-doe");
	});

	test("replaces spaces with hyphens", () => {
		expect(sanitizeAuthorPrefix("John Doe")).toBe("john-doe");
	});

	test("removes special characters", () => {
		expect(sanitizeAuthorPrefix("John's Name!")).toBe("johns-name");
	});

	test("collapses multiple hyphens", () => {
		expect(sanitizeAuthorPrefix("John--Doe")).toBe("john-doe");
	});

	test("removes leading/trailing hyphens", () => {
		expect(sanitizeAuthorPrefix("-John-")).toBe("john");
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

	test("handles empty string", () => {
		expect(sanitizeBranchName("")).toBe("");
	});

	test("handles only slashes", () => {
		expect(sanitizeBranchName("///")).toBe("");
	});
});

describe("findBranchPathConflict", () => {
	test("detects conflict when new branch is child of existing", () => {
		// Creating release/v61 when "release" exists
		expect(findBranchPathConflict("release/v61", ["release", "main"])).toBe(
			"release",
		);
	});

	test("detects conflict when new branch is parent of existing", () => {
		// Creating "release" when "release/v61" exists
		expect(findBranchPathConflict("release", ["release/v61", "main"])).toBe(
			"release/v61",
		);
	});

	test("detects deep nested conflicts", () => {
		// Creating feature/auth/oauth when feature/auth exists
		expect(
			findBranchPathConflict("feature/auth/oauth", ["feature/auth", "main"]),
		).toBe("feature/auth");
	});

	test("returns null when no conflict exists", () => {
		expect(findBranchPathConflict("feature/new", ["release", "main"])).toBe(
			null,
		);
	});

	test("returns null for sibling branches", () => {
		// release-v61 is not a child of release
		expect(findBranchPathConflict("release-v61", ["release", "main"])).toBe(
			null,
		);
	});

	test("handles case insensitive comparison", () => {
		expect(findBranchPathConflict("Release/V61", ["release", "main"])).toBe(
			"release",
		);
	});

	test("returns null for empty existing branches", () => {
		expect(findBranchPathConflict("release/v61", [])).toBe(null);
	});

	test("does not match exact same branch name", () => {
		// Exact match is not a path conflict (it's a duplicate, handled elsewhere)
		expect(findBranchPathConflict("release", ["release"])).toBe(null);
	});
});
