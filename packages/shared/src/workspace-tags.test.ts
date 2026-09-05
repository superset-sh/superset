import { describe, expect, test } from "bun:test";

import {
	isWorkspaceTagVisibleTo,
	normalizeWorkspaceTag,
	normalizeWorkspaceTags,
	SESSIONS_TAG_SCOPE,
	tagFolderScopeInputSchema,
	visibleWorkspaceTags,
	WORKSPACE_TAG_MAX_LENGTH,
	WORKSPACE_TAGS_MAX_PER_WORKSPACE,
	workspaceTagInputSchema,
	workspaceTagsInputSchema,
} from "./workspace-tags";

describe("tagFolderScopeInputSchema", () => {
	test("accepts the Sessions sentinel and project UUIDs", () => {
		expect(tagFolderScopeInputSchema.parse(SESSIONS_TAG_SCOPE)).toBe(
			SESSIONS_TAG_SCOPE,
		);
		expect(
			tagFolderScopeInputSchema.parse("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"),
		).toBe("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
	});

	test("rejects arbitrary non-empty scope strings", () => {
		expect(tagFolderScopeInputSchema.safeParse("anything").success).toBe(false);
		expect(tagFolderScopeInputSchema.safeParse("").success).toBe(false);
	});
});

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

describe("workspaceTagInputSchema", () => {
	test("normalizes one valid tag", () => {
		expect(workspaceTagInputSchema.parse("  Perf Work  ")).toBe("perf work");
	});

	test("rejects whitespace-only and over-length tags", () => {
		expect(workspaceTagInputSchema.safeParse("   ").success).toBe(false);
		expect(
			workspaceTagInputSchema.safeParse(
				"a".repeat(WORKSPACE_TAG_MAX_LENGTH + 1),
			).success,
		).toBe(false);
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

describe("isWorkspaceTagVisibleTo", () => {
	test("a tag is visible to whoever applied it", () => {
		expect(isWorkspaceTagVisibleTo("user-a", "user-a")).toBe(true);
		expect(isWorkspaceTagVisibleTo("user-a", "user-b")).toBe(false);
	});

	test("a tag with no known creator is visible to everyone", () => {
		expect(isWorkspaceTagVisibleTo(null, "user-b")).toBe(true);
		expect(isWorkspaceTagVisibleTo(undefined, "user-b")).toBe(true);
	});

	test("a viewer with no identity sees everything", () => {
		expect(isWorkspaceTagVisibleTo("user-a", null)).toBe(true);
		expect(isWorkspaceTagVisibleTo("user-a", undefined)).toBe(true);
	});
});

describe("visibleWorkspaceTags", () => {
	test("filters to the viewer, then normalizes and sorts", () => {
		expect(
			visibleWorkspaceTags(
				[
					{ tag: "Zeta", createdByUserId: "user-a" },
					{ tag: "theirs", createdByUserId: "user-b" },
					{ tag: "legacy", createdByUserId: null },
					{ tag: "zeta", createdByUserId: null },
				],
				"user-a",
			),
		).toEqual(["legacy", "zeta"]);
	});

	test("empty for no assignments", () => {
		expect(visibleWorkspaceTags(null, "user-a")).toEqual([]);
		expect(visibleWorkspaceTags(undefined, null)).toEqual([]);
	});
});
