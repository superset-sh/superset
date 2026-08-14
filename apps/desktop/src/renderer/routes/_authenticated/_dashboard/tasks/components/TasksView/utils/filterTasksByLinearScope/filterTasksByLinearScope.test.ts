import { describe, expect, test } from "bun:test";
import {
	filterTasksByLinearScope,
	linearInitiativeProjectIdsKey,
} from "./filterTasksByLinearScope";

const tasks = [
	{ id: "task-1", externalProjectId: "project-1" },
	{ id: "task-2", externalProjectId: "project-2" },
	{ id: "task-3", externalProjectId: "project-3" },
	{ id: "task-4", externalProjectId: null },
];

describe("filterTasksByLinearScope", () => {
	test("shows tasks from every project when no Linear scope is selected", () => {
		expect(filterTasksByLinearScope(tasks, null, null)).toEqual(tasks);
	});

	test("filters tasks to all projects in the selected initiative", () => {
		expect(
			filterTasksByLinearScope(tasks, ["project-1", "project-3"], null),
		).toEqual([tasks[0], tasks[2]]);
	});

	test("narrows a selected initiative to one project", () => {
		expect(
			filterTasksByLinearScope(tasks, ["project-1", "project-3"], "project-3"),
		).toEqual([tasks[2]]);
	});

	test("shows no tasks when the selected initiative has no projects", () => {
		expect(filterTasksByLinearScope(tasks, [], null)).toEqual([]);
	});
});

describe("linearInitiativeProjectIdsKey", () => {
	test("distinguishes no initiative from an initiative with no projects", () => {
		expect(linearInitiativeProjectIdsKey(null)).toBe("*");
		expect(linearInitiativeProjectIdsKey([])).toBe("");
	});

	test("serializes selected initiative project ids", () => {
		expect(linearInitiativeProjectIdsKey(["project-a", "project-b"])).toBe(
			"project-a,project-b",
		);
	});
});
