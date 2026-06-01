import { describe, expect, test } from "bun:test";
// biome-ignore lint/style/noRestrictedImports: test file needs fs/path for source verification
import { readFileSync } from "node:fs";
// biome-ignore lint/style/noRestrictedImports: test file needs fs/path for source verification
import { join } from "node:path";

/**
 * Regression test for https://github.com/anthropics/superset/issues/2641
 *
 * The "Run in Workspace" button disappeared because TasksView stopped passing
 * selectedTasks / onClearSelection to TasksTopBar, and TableContent stopped
 * exposing the row-selection state from useTasksTable.
 *
 * These tests verify the wiring exists at the source level so the regression
 * cannot silently reappear.
 */

const TASKS_VIEW_DIR = __dirname;

function readComponent(relativePath: string): string {
	return readFileSync(join(TASKS_VIEW_DIR, relativePath), "utf-8");
}

describe("Run in Workspace selection wiring (#2641)", () => {
	test("TasksView does not block local tasks behind Linear", () => {
		const source = readComponent("TasksView.tsx");

		expect(source).not.toContain("showLinearCTA");
		expect(source).not.toContain("<LinearCTA");
		expect(source).toContain("<TasksTopBar");
	});

	test("TasksView passes selectedTasks and onClearSelection to TasksTopBar", () => {
		const source = readComponent("TasksView.tsx");

		// TasksTopBar must receive selectedTasks prop
		expect(source).toContain("selectedTasks={");

		// TasksTopBar must receive onClearSelection prop
		expect(source).toContain("onClearSelection={");
	});

	test("TasksView passes onSelectionChange to TableContent", () => {
		const source = readComponent("TasksView.tsx");

		// TableContent must receive onSelectionChange callback
		expect(source).toContain("onSelectionChange={");
	});

	test("TasksView passes the project filter through board and table content", () => {
		const source = readComponent("TasksView.tsx");

		expect(source).toContain("projectFilter={projectFilter}");
		expect(source).toContain("isProjectlessTaskFilter(projectFilter)");
	});

	test("TableContent exposes selection state from useTasksTable", () => {
		const source = readComponent("components/TableContent/TableContent.tsx");

		// Must destructure rowSelection and setRowSelection from useTasksTable
		expect(source).toContain("rowSelection");
		expect(source).toContain("setRowSelection");

		// Must accept onSelectionChange prop
		expect(source).toContain("onSelectionChange");
	});

	test("TasksTopBar renders RunInWorkspacePopover when tasks are selected", () => {
		const source = readComponent("components/TasksTopBar/TasksTopBar.tsx");

		// Must use selectedTasks to determine hasSelection
		expect(source).toContain("selectedTasks");
		expect(source).toContain("hasSelection");

		// Must render RunInWorkspacePopover
		expect(source).toContain("RunInWorkspacePopover");
	});

	test("CreateTaskDialog sends rich local task fields", () => {
		const source = readComponent(
			"components/TasksTopBar/components/CreateTaskDialog/CreateTaskDialog.tsx",
		);

		expect(source).toContain("dueDate:");
		expect(source).toContain("labels,");
		expect(source).toContain("v2ProjectId,");
		expect(source).toContain("generateTaskDraft");
	});

	test("CreateTaskDialog uses inline AI polish without dormant attachment or native date controls", () => {
		const source = readComponent(
			"components/TasksTopBar/components/CreateTaskDialog/CreateTaskDialog.tsx",
		);

		expect(source).toContain("AI polish");
		expect(source).toContain("buildTaskPolishPrompt");
		expect(source).toContain("CreateTaskDueDatePicker");
		expect(source).not.toContain("roughPrompt");
		expect(source).not.toContain("Attachments are not wired yet");
		expect(source).not.toContain("HiOutlinePaperClip");
		expect(source).not.toContain('type="date"');
	});

	test("CreateTaskDueDatePicker uses the shared calendar instead of a native date input", () => {
		const source = readComponent(
			"components/TasksTopBar/components/CreateTaskDialog/components/CreateTaskDueDatePicker/CreateTaskDueDatePicker.tsx",
		);

		expect(source).toContain('from "@superset/ui/calendar"');
		expect(source).toContain("<Calendar");
		expect(source).not.toContain('type="date"');
	});
});
