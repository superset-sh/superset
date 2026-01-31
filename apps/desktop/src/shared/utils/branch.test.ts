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
