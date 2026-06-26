import { describe, expect, test } from "bun:test";
import { getKeyboardNavigationPlan } from "./getKeyboardNavigationPlan";

const SAMPLE_GROUPS = [
	{
		project: { id: "project-1" },
		workspaces: [{ id: "workspace-a" }],
		sections: [],
	},
	{
		project: { id: "project-2" },
		workspaces: [],
		sections: [{ workspaces: [{ id: "workspace-b" }] }],
	},
];

describe("getKeyboardNavigationPlan", () => {
	test("expands the project when it is collapsed", () => {
		const collapsedProjectIds = new Set(["project-1"]);
		const plan = getKeyboardNavigationPlan("workspace-a", SAMPLE_GROUPS, (id) =>
			collapsedProjectIds.has(id),
		);
		expect(plan).toEqual({ expandProjectId: "project-1" });
	});

	test("does not expand the project when it is already expanded", () => {
		const plan = getKeyboardNavigationPlan(
			"workspace-a",
			SAMPLE_GROUPS,
			() => false,
		);
		expect(plan).toEqual({ expandProjectId: null });
	});

	test("expands the project for a workspace nested inside a section", () => {
		const collapsedProjectIds = new Set(["project-2"]);
		const plan = getKeyboardNavigationPlan("workspace-b", SAMPLE_GROUPS, (id) =>
			collapsedProjectIds.has(id),
		);
		expect(plan).toEqual({ expandProjectId: "project-2" });
	});

	test("returns no expand action when the workspace cannot be located", () => {
		const plan = getKeyboardNavigationPlan(
			"workspace-missing",
			SAMPLE_GROUPS,
			() => true,
		);
		expect(plan).toEqual({ expandProjectId: null });
	});
});
