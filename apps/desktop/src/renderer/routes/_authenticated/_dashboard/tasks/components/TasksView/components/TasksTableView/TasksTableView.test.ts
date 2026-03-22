import { describe, expect, test } from "bun:test";
// biome-ignore lint/style/noRestrictedImports: test file needs fs/path for source verification
import { readFileSync } from "node:fs";
// biome-ignore lint/style/noRestrictedImports: test file needs fs/path for source verification
import { join } from "node:path";

const TASKS_TABLE_VIEW_DIR = __dirname;

function readComponent(relativePath: string): string {
	return readFileSync(join(TASKS_TABLE_VIEW_DIR, relativePath), "utf-8");
}

describe("Tasks table delete wiring", () => {
	test("TaskContextMenu deletes tasks through the collections API", () => {
		const source = readComponent(
			"components/TaskContextMenu/TaskContextMenu.tsx",
		);

		expect(source).toContain("collections.tasks.delete(task.id)");
		expect(source).toContain("onSelect={handleDelete}");
	});

	test("TasksTableView no longer uses a delete stub", () => {
		const source = readComponent("TasksTableView.tsx");

		expect(source).not.toContain('console.log("Delete task:');
		expect(source).toContain("<TaskContextMenu task={row.original}>");
	});
});
