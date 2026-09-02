import { describe, expect, it } from "bun:test";
import {
	getWorkspaceFocusTargetAfterRemoval,
	removeProjectFromGroups,
	removeWorkspaceFromGroups,
} from "./workspace-removal";

const groups = [
	{
		workspaces: [
			{ id: "w1", tabOrder: 1 },
			{ id: "w4", tabOrder: 4 },
		],
		sections: [
			{
				id: "s1",
				tabOrder: 2,
				workspaces: [
					{ id: "w2", tabOrder: 1 },
					{ id: "w3", tabOrder: 2 },
				],
			},
		],
		topLevelItems: [
			{ id: "w1", kind: "workspace" as const, tabOrder: 1 },
			{ id: "s1", kind: "section" as const, tabOrder: 2 },
			{ id: "w4", kind: "workspace" as const, tabOrder: 3 },
		],
	},
];

describe("getWorkspaceFocusTargetAfterRemoval", () => {
	it("selects next, then previous, in sidebar visual order", () => {
		expect(getWorkspaceFocusTargetAfterRemoval(groups, "w2")).toBe("w3");
		expect(getWorkspaceFocusTargetAfterRemoval(groups, "w4")).toBe("w3");
		expect(
			getWorkspaceFocusTargetAfterRemoval(
				[
					{
						workspaces: [{ id: "w1", tabOrder: 1 }],
						sections: [],
						topLevelItems: [
							{ id: "w1", kind: "workspace" as const, tabOrder: 1 },
						],
					},
				],
				"w1",
			),
		).toBeNull();
	});
});

describe("removeWorkspaceFromGroups", () => {
	it("removes section and top-level workspaces", () => {
		expect(
			removeWorkspaceFromGroups(groups, "w2")[0]?.sections[0]?.workspaces.map(
				(workspace) => workspace.id,
			),
		).toEqual(["w3"]);
		expect(
			removeWorkspaceFromGroups(groups, "w4")[0]?.topLevelItems.map(
				(item) => item.id,
			),
		).toEqual(["w1", "s1"]);
	});
});

describe("removeProjectFromGroups", () => {
	it("removes every workspace group for the closed project", () => {
		const groupedProjects = [
			{ project: { id: "p1" }, ...groups[0] },
			{
				project: { id: "p2" },
				workspaces: [{ id: "w5", tabOrder: 1 }],
				sections: [],
				topLevelItems: [{ id: "w5", kind: "workspace" as const, tabOrder: 1 }],
			},
		];

		expect(removeProjectFromGroups(groupedProjects, "p1")).toEqual([
			groupedProjects[1],
		]);
	});
});
