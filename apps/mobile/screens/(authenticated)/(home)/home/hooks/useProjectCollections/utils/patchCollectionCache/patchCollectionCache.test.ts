import { describe, expect, test } from "bun:test";
import {
	nextCollectionTabOrder,
	withCollectionSetting,
	withProjectTags,
} from "./patchCollectionCache";

describe("withProjectTags", () => {
	test("replaces the tags of one project only", () => {
		const rows = [
			{ id: "a", tags: ["old"] },
			{ id: "b", tags: ["keep"] },
		];
		expect(withProjectTags(rows, "a", ["team"])).toEqual([
			{ id: "a", tags: ["team"] },
			{ id: "b", tags: ["keep"] },
		]);
		expect(rows[0]?.tags).toEqual(["old"]);
	});

	test("leaves an empty cache empty", () => {
		expect(withProjectTags(undefined, "a", [])).toBeUndefined();
	});
});

describe("withCollectionSetting", () => {
	test("adds the setting, replacing one with the same scope and tag", () => {
		const setting = {
			scope: "projects",
			tag: "team",
			displayName: "Team",
			color: null,
			tabOrder: 3,
		};
		expect(
			withCollectionSetting(
				[
					{ ...setting, displayName: "Old" },
					{ ...setting, scope: "sessions" },
				],
				setting,
			),
		).toEqual([{ ...setting, scope: "sessions" }, setting]);
		expect(withCollectionSetting(undefined, setting)).toEqual([setting]);
	});
});

describe("nextCollectionTabOrder", () => {
	test("orders a new collection after every placed one", () => {
		expect(nextCollectionTabOrder([])).toBeGreaterThanOrEqual(1_000_000);
		expect(
			nextCollectionTabOrder([{ tabOrder: 4 }, { tabOrder: null }]),
		).toBeGreaterThanOrEqual(1_000_000);
		expect(nextCollectionTabOrder([{ tabOrder: 1_000_004 }])).toBe(1_000_005);
	});
});
