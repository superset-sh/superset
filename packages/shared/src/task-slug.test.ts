import { describe, expect, it } from "bun:test";
import { generateBaseTaskSlug, generateUniqueTaskSlug } from "./task-slug";

describe("generateBaseTaskSlug", () => {
	it("normalizes titles into lowercase kebab-case slugs", () => {
		expect(generateBaseTaskSlug("Fix Linear Sync!")).toBe("fix-linear-sync");
	});

	it("falls back to task when the title has no slug characters", () => {
		expect(generateBaseTaskSlug("!!!")).toBe("task");
	});
});

describe("generateUniqueTaskSlug", () => {
	it("returns the base slug when unused", () => {
		expect(generateUniqueTaskSlug("fix-linear-sync", [])).toBe(
			"fix-linear-sync",
		);
	});

	it("increments numeric suffixes until it finds a free slug", () => {
		expect(
			generateUniqueTaskSlug("fix-linear-sync", [
				"fix-linear-sync",
				"fix-linear-sync-1",
				"fix-linear-sync-2",
			]),
		).toBe("fix-linear-sync-3");
	});
});
