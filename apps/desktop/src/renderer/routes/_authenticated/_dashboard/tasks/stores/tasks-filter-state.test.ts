import { describe, expect, test } from "bun:test";
import {
	migrateTasksFilterState,
	tasksSearchFromFilters,
	useTasksFilterStore,
} from "./tasks-filter-state";

describe("useTasksFilterStore.setProjectFilters", () => {
	test("does not notify subscribers when filters are unchanged", () => {
		// Views sync filters back through an effect keyed on this array, so an
		// always-fresh reference here regresses into an infinite update loop.
		const { setProjectFilters } = useTasksFilterStore.getState();
		setProjectFilters(["project-1", "project-2"]);
		const before = useTasksFilterStore.getState().projectFilters;
		let notifications = 0;
		const unsubscribe = useTasksFilterStore.subscribe(() => {
			notifications += 1;
		});
		setProjectFilters(["project-1", "project-2"]);
		unsubscribe();
		expect(useTasksFilterStore.getState().projectFilters).toBe(before);
		expect(notifications).toBe(0);
		useTasksFilterStore.getState().setProjectFilters([]);
	});
});

describe("tasksSearchFromFilters", () => {
	test("keeps default task filters out of the URL", () => {
		expect(
			tasksSearchFromFilters({
				tab: "all",
				assignee: null,
				search: "",
				typeTab: "tasks",
				projectFilters: [],
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
				projectFilters: ["project-1", "project-2"],
				linearProjectFilter: null,
				includeClosedIssues: true,
			}),
		).toEqual({
			tab: "active",
			assignee: "me",
			search: "remote host",
			type: "issues",
			projects: "project-1,project-2",
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
				projectFilters: ["project-1"],
				linearProjectFilter: "linear-project-1",
				includeClosedIssues: true,
			}),
		).toEqual({
			projects: "project-1",
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
			projectFilters: ["project-1"],
			includeClosedIssues: false,
		});
	});

	test("survives corrupt persisted values", () => {
		expect(
			migrateTasksFilterState({
				tab: "waiting",
				viewMode: "grid",
				linearProjectFilter: 42,
				projectFilters: ["project-1", false, "project-1"],
			}),
		).toMatchObject({
			tab: "all",
			typeTab: "tasks",
			viewMode: "table",
			includeClosedIssues: false,
			linearProjectFilter: null,
			projectFilters: ["project-1"],
		});
		expect(migrateTasksFilterState(null)).toMatchObject({
			tab: "all",
			typeTab: "tasks",
			viewMode: "table",
			includeClosedIssues: false,
			linearProjectFilter: null,
			projectFilters: [],
		});
	});

	test("normalizes a persisted Linear project filter", () => {
		expect(
			migrateTasksFilterState({
				linearProjectFilter: "  linear-project-1  ",
			}),
		).toMatchObject({
			linearProjectFilter: "linear-project-1",
		});
	});
});
