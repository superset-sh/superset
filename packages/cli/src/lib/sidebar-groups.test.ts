import { describe, expect, test } from "bun:test";
import { CLIError } from "@superset/cli-framework";
import { assertSameProject, toGroupRows } from "./sidebar-groups";

describe("sidebar groups CLI helpers", () => {
	test("formats groups with sorted members from the latest snapshot", () => {
		const rows = toGroupRows({
			version: 1,
			organizationId: "org-1",
			operations: [],
			claimedOperation: null,
			snapshot: {
				updatedAt: "2026-01-01T00:00:00.000Z",
				sections: [
					{
						id: "section-1",
						projectId: "project-1",
						name: "Backend",
						createdAt: "2026-01-01T00:00:00.000Z",
						tabOrder: 1,
						isCollapsed: false,
						color: null,
					},
				],
				workspaces: [
					{
						id: "workspace-2",
						projectId: "project-1",
						name: "Alpha",
						branch: "alpha",
						sectionId: "section-1",
						tabOrder: 2,
					},
					{
						id: "workspace-1",
						projectId: "project-1",
						name: "Zeta",
						branch: "zeta",
						sectionId: "section-1",
						tabOrder: 1,
					},
				],
			},
		});

		expect(rows).toMatchObject([
			{
				id: "section-1",
				workspaceCount: 2,
				workspaces: "Zeta, Alpha",
			},
		]);
	});

	test("rejects creating a group across projects", () => {
		expect(() =>
			assertSameProject(["workspace-1", "workspace-2"], {
				updatedAt: "2026-01-01T00:00:00.000Z",
				sections: [],
				workspaces: [
					{
						id: "workspace-1",
						projectId: "project-1",
						name: "First",
						branch: "first",
						sectionId: null,
						tabOrder: 1,
					},
					{
						id: "workspace-2",
						projectId: "project-2",
						name: "Second",
						branch: "second",
						sectionId: null,
						tabOrder: 2,
					},
				],
			}),
		).toThrow(CLIError);
	});
});
