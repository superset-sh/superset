import { describe, expect, test } from "bun:test";
// biome-ignore lint/style/noRestrictedImports: test file needs fs/path for source verification
import { readFileSync } from "node:fs";
// biome-ignore lint/style/noRestrictedImports: test file needs fs/path for source verification
import { join } from "node:path";

const TASK_DETAIL_DIR = __dirname;

function readComponent(relativePath: string): string {
	return readFileSync(join(TASK_DETAIL_DIR, relativePath), "utf-8");
}

describe("Task detail action menu", () => {
	test("page renders the task action menu in the header", () => {
		const source = readComponent("page.tsx");
		const headerSource = readComponent(
			"components/TaskDetailHeader/TaskDetailHeader.tsx",
		);

		expect(source).toContain(
			'import { TaskDetailHeader } from "./components/TaskDetailHeader";',
		);
		expect(source).toContain("<TaskDetailHeader");
		expect(source).toContain("onBack={handleBack}");
		expect(source).toContain("onDelete={handleDelete}");
		expect(headerSource).toContain('aria-label="Back to tasks"');
	});

	test("task action menu mirrors destructive and copy actions", () => {
		const source = readComponent(
			"components/TaskActionMenu/TaskActionMenu.tsx",
		);

		expect(source).toContain("await collections.tasks.delete(task.id)");
		expect(source).toContain(
			'console.error("[TaskActionMenu] Failed to delete task:", error)',
		);
		expect(source).toContain("copyToClipboard(task.slug)");
		expect(source).toContain("copyToClipboard(task.title)");
		expect(source).not.toContain("<span>Status</span>");
		expect(source).not.toContain("<span>Assignee</span>");
		expect(source).not.toContain("<span>Priority</span>");
	});
});
