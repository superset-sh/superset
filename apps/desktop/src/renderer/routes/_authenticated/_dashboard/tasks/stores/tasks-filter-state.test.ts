import { describe, expect, test } from "bun:test";
import {
	migrateTasksFilterState,
	tasksSearchFromFilters,
} from "./tasks-filter-state";

describe("tasksSearchFromFilters", () => {
	test("keeps default task filters out of the URL", () => {
		expect(
			tasksSearchFromFilters({
				tab: "all",
				assignee: null,
				search: "",
				typeTab: "tasks",
				projectFilter: null,
				linearProjectFilter: null,
				includeClosedIssues: false,
			}),
		).toEqual({});
	});

	test("preserves GitHub Issue context across detail navigation", () => {
		expect(
			tasksSearchFromFilters({
				tab: "active",
				assignee: "me",
				search: "remote host",
				typeTab: "issues",
				projectFilter: "project-1",
				linearProjectFilter: null,
				includeClosedIssues: true,
			}),
		).toEqual({
			tab: "active",
			assignee: "me",
			search: "remote host",
			type: "issues",
			project: "project-1",
			state: "all",
		});
	});

	test("does not leak the issue state filter into Linear tasks", () => {
		expect(
			tasksSearchFromFilters({
				tab: "all",
				assignee: null,
				search: "",
				typeTab: "tasks",
				projectFilter: "project-1",
				linearProjectFilter: "linear-project-1",
				includeClosedIssues: true,
			}),
		).toEqual({
			project: "project-1",
			linearProject: "linear-project-1",
		});
	});
});

describe("migrateTasksFilterState", () => {
	test("moves legacy PR tabs back to Tasks and defaults issue state safely", () => {
		expect(
			migrateTasksFilterState({
				typeTab: "prs",
				projectFilter: "project-1",
			}),
		).toMatchObject({
			typeTab: "tasks",
			projectFilter: "project-1",
			includeClosedIssues: false,
		});
	});

	test("survives corrupt persisted values", () => {
		expect(migrateTasksFilterState(null)).toMatchObject({
			typeTab: "tasks",
			includeClosedIssues: false,
		});
	});
});
