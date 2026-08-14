import { describe, expect, test } from "bun:test";
import { buildLinearInitiativeProjects } from "./initiative-projects";

describe("buildLinearInitiativeProjects", () => {
	test("groups project ids under sorted active initiatives", () => {
		expect(
			buildLinearInitiativeProjects(
				[
					{ id: "initiative-2", name: "Reliability" },
					{ id: "initiative-1", name: "Developer experience" },
					{ id: "initiative-3", name: "Archived", trashed: true },
				],
				[
					{ initiativeId: "initiative-2", projectId: "project-3" },
					{ initiativeId: "initiative-1", projectId: "project-1" },
					{ initiativeId: "initiative-1", projectId: "project-2" },
					{ initiativeId: "initiative-1", projectId: "project-2" },
					{ initiativeId: undefined, projectId: "project-4" },
				],
			),
		).toEqual([
			{
				id: "initiative-1",
				name: "Developer experience",
				projectIds: ["project-1", "project-2"],
			},
			{
				id: "initiative-2",
				name: "Reliability",
				projectIds: ["project-3"],
			},
		]);
	});

	test("keeps initiatives that do not have projects", () => {
		expect(
			buildLinearInitiativeProjects(
				[{ id: "initiative-1", name: "Future work" }],
				[],
			),
		).toEqual([{ id: "initiative-1", name: "Future work", projectIds: [] }]);
	});
});
