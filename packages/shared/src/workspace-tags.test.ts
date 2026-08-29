import { describe, expect, test } from "bun:test";

import {
	normalizeWorkspaceTag,
	normalizeWorkspaceTags,
	WORKSPACE_TAG_MAX_LENGTH,
	WORKSPACE_TAGS_MAX_PER_WORKSPACE,
	workspaceTagsInputSchema,
} from "./workspace-tags";

describe("normalizeWorkspaceTag", () => {
	test("trims and lowercases", () => {
		expect(normalizeWorkspaceTag("  Perf Work  ")).toBe("perf work");
	});

	test("returns null for empty and whitespace-only", () => {
		expect(normalizeWorkspaceTag("")).toBeNull();
		expect(normalizeWorkspaceTag("   ")).toBeNull();
	});

	test("returns null for over-length", () => {
		expect(normalizeWorkspaceTag("a".repeat(WORKSPACE_TAG_MAX_LENGTH))).toBe(
			"a".repeat(WORKSPACE_TAG_MAX_LENGTH),
		);
		expect(
			normalizeWorkspaceTag("a".repeat(WORKSPACE_TAG_MAX_LENGTH + 1)),
		).toBeNull();
	});

	test("returns null for null and undefined", () => {
		expect(normalizeWorkspaceTag(null)).toBeNull();
		expect(normalizeWorkspaceTag(undefined)).toBeNull();
	});

	test("handles a field that is absent on a persisted object", () => {
		// A row written before the field existed carries undefined; the
		// normalizer must not reach .trim() on it.
		const legacyRow = {} as { tag?: string };
		expect(normalizeWorkspaceTag(legacyRow.tag)).toBeNull();
	});
});

describe("normalizeWorkspaceTags", () => {
	test("normalizes, drops invalid, dedupes, sorts", () => {
		expect(
			normalizeWorkspaceTags(["Perf", "  perf ", "", "zeta", "Alpha"]),
		).toEqual(["alpha", "perf", "zeta"]);
	});

	test("returns empty array for null, undefined, empty", () => {
		expect(normalizeWorkspaceTags(null)).toEqual([]);
		expect(normalizeWorkspaceTags(undefined)).toEqual([]);
		expect(normalizeWorkspaceTags([])).toEqual([]);
	});

	test("drops null and undefined members", () => {
		expect(normalizeWorkspaceTags(["a", null, undefined, "b"])).toEqual([
			"a",
			"b",
		]);
	});
});

describe("workspaceTagsInputSchema", () => {
	test("parses to normalized, deduped, sorted set", () => {
		expect(workspaceTagsInputSchema.parse(["Perf", " perf", "Alpha"])).toEqual([
			"alpha",
			"perf",
		]);
	});

	test("rejects empty tags instead of dropping them", () => {
		const result = workspaceTagsInputSchema.safeParse(["ok", "   "]);
		expect(result.success).toBe(false);
	});

	test("rejects over-length tags instead of dropping them", () => {
		const result = workspaceTagsInputSchema.safeParse([
			"a".repeat(WORKSPACE_TAG_MAX_LENGTH + 1),
		]);
		expect(result.success).toBe(false);
	});

	test("rejects sets over the cap", () => {
		const tags = Array.from(
			{ length: WORKSPACE_TAGS_MAX_PER_WORKSPACE + 1 },
			(_, index) => `tag-${index}`,
		);
		const result = workspaceTagsInputSchema.safeParse(tags);
		expect(result.success).toBe(false);
	});

	test("cap applies to the deduped set", () => {
		const tags = Array.from(
			{ length: WORKSPACE_TAGS_MAX_PER_WORKSPACE + 5 },
			() => "same",
		);
		expect(workspaceTagsInputSchema.parse(tags)).toEqual(["same"]);
	});

	test("accepts exactly the cap", () => {
		const tags = Array.from(
			{ length: WORKSPACE_TAGS_MAX_PER_WORKSPACE },
			(_, index) => `tag-${index}`,
		);
		expect(workspaceTagsInputSchema.parse(tags)).toHaveLength(
			WORKSPACE_TAGS_MAX_PER_WORKSPACE,
		);
	});
});
