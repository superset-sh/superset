import { describe, expect, test } from "bun:test";
import {
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

	test("removes special characters but keeps underscores and dots", () => {
		expect(sanitizeAuthorPrefix("John's Name!")).toBe("johns-name");
		expect(sanitizeAuthorPrefix("user_name")).toBe("user_name");
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
