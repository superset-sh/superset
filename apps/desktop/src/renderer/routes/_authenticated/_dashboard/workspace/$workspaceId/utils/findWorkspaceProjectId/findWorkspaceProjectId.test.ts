import { describe, expect, test } from "bun:test";
import { findWorkspaceProjectId } from "./findWorkspaceProjectId";

describe("findWorkspaceProjectId", () => {
	test("returns the project id of an ungrouped workspace", () => {
		const groups = [
			{
				project: { id: "project-1" },
				workspaces: [{ id: "workspace-a" }, { id: "workspace-b" }],
				sections: [],
			},
			{
				project: { id: "project-2" },
				workspaces: [{ id: "workspace-c" }],
				sections: [],
			},
		];
		expect(findWorkspaceProjectId("workspace-b", groups)).toBe("project-1");
		expect(findWorkspaceProjectId("workspace-c", groups)).toBe("project-2");
	});

	test("returns the project id when the workspace lives inside a section", () => {
		const groups = [
			{
				project: { id: "project-1" },
				workspaces: [],
				sections: [
					{ workspaces: [{ id: "workspace-a" }, { id: "workspace-b" }] },
				],
			},
		];
		expect(findWorkspaceProjectId("workspace-a", groups)).toBe("project-1");
		expect(findWorkspaceProjectId("workspace-b", groups)).toBe("project-1");
	});

	test("returns null when the workspace cannot be found", () => {
		const groups = [
			{
				project: { id: "project-1" },
				workspaces: [{ id: "workspace-a" }],
				sections: [],
			},
		];
		expect(findWorkspaceProjectId("workspace-missing", groups)).toBeNull();
	});

	test("returns null when groups are empty", () => {
		expect(findWorkspaceProjectId("workspace-a", [])).toBeNull();
	});
});
