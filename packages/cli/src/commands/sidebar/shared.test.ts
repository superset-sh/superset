import { describe, expect, it } from "bun:test";
import { resolveGroup, resolveProject, resolveWorkspace } from "./shared";

describe("sidebar CLI name resolution", () => {
	it("accepts stable IDs and case-insensitive exact names", () => {
		const projects = [{ id: "project-1", name: "Superset" }];
		const workspaces = [
			{ id: "workspace-1", projectId: "project-1", name: "CLI Evidence" },
		];
		expect(resolveProject(projects, "project-1")).toBe(projects[0]!);
		expect(resolveProject(projects, "superset")).toBe(projects[0]!);
		expect(resolveWorkspace(workspaces, "cli evidence")).toBe(workspaces[0]!);
	});

	it("scopes group names to the workspace project", () => {
		const state = {
			projects: [],
			groups: [
				{
					id: "group-1",
					projectId: "project-1",
					name: "Review",
					tabOrder: 1,
					isCollapsed: false,
					color: null,
				},
				{
					id: "group-2",
					projectId: "project-2",
					name: "Review",
					tabOrder: 1,
					isCollapsed: false,
					color: null,
				},
			],
			workspaces: [],
		};
		expect(resolveGroup(state, "Review", "project-2").id).toBe("group-2");
		expect(() => resolveGroup(state, "Review")).toThrow("ambiguous");
	});
});
