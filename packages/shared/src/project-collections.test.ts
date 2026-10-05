import { describe, expect, test } from "bun:test";
import {
	type ProjectCollectionSetting,
	projectCollectionId,
	resolveProjectCollections,
} from "./project-collections";

const setting = (
	tag: string,
	tabOrder: number | null = null,
	displayName: string | null = null,
	color: string | null = null,
): ProjectCollectionSetting => ({ tag, tabOrder, displayName, color });

describe("resolveProjectCollections", () => {
	test("unions project tags and settings, keeping empty collections", () => {
		const result = resolveProjectCollections({
			projects: [
				{ id: "one", tags: [" Team ", "team"] },
				{ id: "loose", tags: [] },
				{ id: "legacy" },
			],
			settings: [setting("empty", null, "Empty", "#00ff00")],
		});
		expect(result.collections).toEqual([
			{ tag: "empty", name: "Empty", color: "#00ff00", tabOrder: 1_000_000 },
			{ tag: "team", name: "team", color: null, tabOrder: 1_000_001 },
		]);
		expect(result.collectionByProjectId.get("one")?.tag).toBe("team");
		expect(result.collectionByProjectId.has("loose")).toBe(false);
		expect(result.collectionByProjectId.has("legacy")).toBe(false);
	});

	test("orders collections by tab order, then tag", () => {
		const result = resolveProjectCollections({
			projects: [{ id: "p", tags: ["b", "a", "c"] }],
			settings: [setting("c", 1), setting("b", 1), setting("a", 5)],
		});
		expect(result.collections.map((row) => row.tag)).toEqual(["b", "c", "a"]);
	});

	test("puts a project in one collection: lowest order, then tag", () => {
		const result = resolveProjectCollections({
			projects: [
				{ id: "ordered", tags: ["late", "early"] },
				{ id: "tied", tags: ["zeta", "alpha"] },
			],
			settings: [
				setting("late", 9),
				setting("early", 2),
				setting("zeta", 4),
				setting("alpha", 4),
			],
		});
		expect(result.collectionByProjectId.get("ordered")?.tag).toBe("early");
		expect(result.collectionByProjectId.get("tied")?.tag).toBe("alpha");
	});

	test("an override replaces the stored tab order", () => {
		const result = resolveProjectCollections({
			projects: [{ id: "p", tags: ["a", "b"] }],
			settings: [setting("a", 1), setting("b", 2)],
			tabOrderOverride: (tag) => (tag === "b" ? 0 : undefined),
		});
		expect(result.collections.map((row) => row.tag)).toEqual(["b", "a"]);
		expect(result.collectionByProjectId.get("p")?.tag).toBe("b");
	});

	test("normalizes setting tags and ignores invalid ones", () => {
		const result = resolveProjectCollections({
			projects: [],
			settings: [setting(" Work ", 3, "Work"), setting("   ")],
		});
		expect(result.collections).toEqual([
			{ tag: "work", name: "Work", color: null, tabOrder: 3 },
		]);
	});
});

describe("projectCollectionId", () => {
	test("scopes the tag under the projects sentinel", () => {
		expect(projectCollectionId("team")).toBe("projects:team");
	});
});
