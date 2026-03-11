import { describe, expect, test } from "bun:test";
import { reorderProjectChildrenInCache } from "./reorderProjectChildrenInCache";

describe("reorderProjectChildrenInCache", () => {
	test("reorders a section ahead of a top-level workspace and normalizes tabOrder", () => {
		const result = reorderProjectChildrenInCache(
			[
				{
					project: { id: "p1" },
					workspaces: [
						{ id: "w1", tabOrder: 0 },
						{ id: "w2", tabOrder: 2 },
					],
					sections: [
						{
							id: "s1",
							tabOrder: 1,
							workspaces: [{ id: "w3", tabOrder: 0 }],
						},
					],
					topLevelItems: [
						{ id: "w1", kind: "workspace" as const, tabOrder: 0 },
						{ id: "s1", kind: "section" as const, tabOrder: 1 },
						{ id: "w2", kind: "workspace" as const, tabOrder: 2 },
					],
				},
			],
			"p1",
			1,
			0,
		);

		expect(result).toEqual([
			{
				project: { id: "p1" },
				workspaces: [
					{ id: "w1", tabOrder: 1 },
					{ id: "w2", tabOrder: 2 },
				],
				sections: [
					{
						id: "s1",
						tabOrder: 0,
						workspaces: [{ id: "w3", tabOrder: 0 }],
					},
				],
				topLevelItems: [
					{ id: "s1", kind: "section", tabOrder: 0 },
					{ id: "w1", kind: "workspace", tabOrder: 1 },
					{ id: "w2", kind: "workspace", tabOrder: 2 },
				],
			},
		]);
	});

	test("does not change unrelated projects", () => {
		const data = [
			{
				project: { id: "p1" },
				workspaces: [{ id: "w1", tabOrder: 0 }],
				sections: [],
				topLevelItems: [{ id: "w1", kind: "workspace" as const, tabOrder: 0 }],
			},
			{
				project: { id: "p2" },
				workspaces: [{ id: "w2", tabOrder: 0 }],
				sections: [],
				topLevelItems: [{ id: "w2", kind: "workspace" as const, tabOrder: 0 }],
			},
		];

		expect(reorderProjectChildrenInCache(data, "p2", 0, 0)).toEqual(data);
	});
});
