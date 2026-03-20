import { describe, expect, it } from "bun:test";
import {
	deriveTaskBranchName,
	getTaskBranchCandidates,
	getTaskIdentifierCandidates,
} from "./task-identifiers";

describe("getTaskIdentifierCandidates", () => {
	it("returns [externalKey, slug] for a Linear-synced task", () => {
		const result = getTaskIdentifierCandidates({
			id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
			slug: "ENG-123",
			externalKey: "ENG-123",
		});
		// externalKey === slug, so deduplicated to one + short id
		expect(result).toEqual(["ENG-123", "aaaaaaaa"]);
	});

	it("returns [externalKey, slug, shortId] when slug differs from externalKey", () => {
		const result = getTaskIdentifierCandidates({
			id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
			slug: "ENG-123-1",
			externalKey: "ENG-123",
		});
		expect(result).toEqual(["ENG-123", "ENG-123-1", "aaaaaaaa"]);
	});

	it("returns just [slug] for a local task without externalKey", () => {
		const result = getTaskIdentifierCandidates({
			id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
			slug: "fix-login-bug",
			externalKey: null,
		});
		expect(result).toEqual(["fix-login-bug"]);
	});

	it("returns just [slug] when externalKey is undefined", () => {
		const result = getTaskIdentifierCandidates({
			id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
			slug: "my-task",
		});
		expect(result).toEqual(["my-task"]);
	});

	it("deduplicates case-insensitively", () => {
		const result = getTaskIdentifierCandidates({
			id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
			slug: "eng-123",
			externalKey: "ENG-123",
		});
		// ENG-123 and eng-123 are the same case-insensitively
		expect(result).toEqual(["ENG-123", "aaaaaaaa"]);
	});
});

describe("deriveTaskBranchName", () => {
	it("combines lowercased slug with sanitized title", () => {
		const result = deriveTaskBranchName({
			slug: "ENG-123",
			title: "Fix login bug",
		});
		expect(result).toBe("eng-123-fix-login-bug");
	});

	it("returns just the lowercased slug when title sanitizes to empty", () => {
		const result = deriveTaskBranchName({
			slug: "ENG-123",
			title: "!!!",
		});
		expect(result).toBe("eng-123");
	});

	it("truncates long titles", () => {
		const result = deriveTaskBranchName({
			slug: "ENG-1",
			title: "A".repeat(100),
		});
		// sanitizeSegment truncates to 40 chars
		expect(result.length).toBeLessThanOrEqual(46); // "eng-1-" + 40
		expect(result.startsWith("eng-1-")).toBe(true);
	});
});

describe("getTaskBranchCandidates", () => {
	it("generates branch candidates for a Linear-synced task", () => {
		const result = getTaskBranchCandidates({
			id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
			slug: "ENG-123",
			externalKey: "ENG-123",
			title: "Fix login bug",
		});
		// Should include derived branch names and plain lowercased identifiers
		expect(result).toContain("eng-123-fix-login-bug");
		expect(result).toContain("eng-123");
		expect(result).toContain("aaaaaaaa-fix-login-bug");
		expect(result).toContain("aaaaaaaa");
	});

	it("generates branch candidates for a collided-slug Linear task", () => {
		const result = getTaskBranchCandidates({
			id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
			slug: "ENG-123-1",
			externalKey: "ENG-123",
			title: "Fix login bug",
		});
		// Should include candidates for both externalKey and the stored slug
		expect(result).toContain("eng-123-fix-login-bug");
		expect(result).toContain("eng-123-1-fix-login-bug");
		expect(result).toContain("eng-123");
		expect(result).toContain("eng-123-1");
	});

	it("generates branch candidates for a local task", () => {
		const result = getTaskBranchCandidates({
			id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
			slug: "fix-login-bug",
			externalKey: null,
			title: "Fix login bug",
		});
		expect(result).toContain("fix-login-bug-fix-login-bug");
		expect(result).toContain("fix-login-bug");
	});

	it("deduplicates candidates", () => {
		const result = getTaskBranchCandidates({
			id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
			slug: "my-task",
			externalKey: null,
			title: "My Task",
		});
		const unique = new Set(result);
		expect(result.length).toBe(unique.size);
	});

	it("returns non-empty array", () => {
		const result = getTaskBranchCandidates({
			id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
			slug: "x",
			externalKey: null,
			title: "Hello",
		});
		expect(result.length).toBeGreaterThan(0);
	});
});
