import { describe, expect, it } from "bun:test";
import {
	normalizeWorkspaceTag,
	normalizeWorkspaceTags,
} from "../src/workspaces/local-workspace-store";

describe("normalizeWorkspaceTag", () => {
	it("trims and lowercases", () => {
		expect(normalizeWorkspaceTag("  PERF ")).toBe("perf");
		expect(normalizeWorkspaceTag("Load-Testing")).toBe("load-testing");
	});

	it("rejects empty and over-length tags", () => {
		expect(normalizeWorkspaceTag("   ")).toBeNull();
		expect(normalizeWorkspaceTag("")).toBeNull();
		expect(normalizeWorkspaceTag("x".repeat(65))).toBeNull();
		expect(normalizeWorkspaceTag("x".repeat(64))).toBe("x".repeat(64));
	});

	it("keeps unicode as typed (lowercased)", () => {
		expect(normalizeWorkspaceTag("Ünïcode")).toBe("ünïcode");
	});
});

describe("normalizeWorkspaceTags", () => {
	it("dedupes case-colliding tags to one", () => {
		expect(normalizeWorkspaceTags(["PERF", "perf", " Perf "])).toEqual([
			"perf",
		]);
	});

	it("drops empties and caps the set at 32", () => {
		const many = Array.from({ length: 60 }, (_, i) => `tag-${i}`);
		const result = normalizeWorkspaceTags(["", "  ", ...many]);
		expect(result).toHaveLength(32);
		expect(result[0]).toBe("tag-0");
	});

	it("preserves first-seen order for distinct tags", () => {
		expect(normalizeWorkspaceTags(["b", "a", "B"])).toEqual(["b", "a"]);
	});
});
