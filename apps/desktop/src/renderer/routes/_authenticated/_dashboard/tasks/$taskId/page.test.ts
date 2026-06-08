import { describe, expect, it } from "bun:test";
// biome-ignore lint/style/noRestrictedImports: source-level regression test inspects files directly
import { readFileSync } from "node:fs";
// biome-ignore lint/style/noRestrictedImports: source-level regression test inspects files directly
import { join } from "node:path";

const TASK_DETAIL_DIR = import.meta.dir;

function readTaskDetailFile(relativePath: string): string {
	return readFileSync(join(TASK_DETAIL_DIR, relativePath), "utf-8");
}

describe("Task detail sync fallback", () => {
	it("renders API fallback task data instead of blocking on local collection sync", () => {
		const source = readTaskDetailFile("page.tsx");

		expect(source).toContain(
			"const fallbackTask = !task ? (taskFallbackQuery.data ?? null) : null;",
		);
		expect(source).toContain("<TaskDetailSyncingFallback");
		expect(source).not.toContain("Syncing task...");
	});

	it("keeps the fallback view read-only until the local task row is synced", () => {
		const source = readTaskDetailFile(
			"components/TaskDetailSyncingFallback/TaskDetailSyncingFallback.tsx",
		);

		expect(source).toContain("Editing unlocks after local sync finishes.");
		expect(source).not.toContain("useOptimisticCollectionActions");
	});
});
