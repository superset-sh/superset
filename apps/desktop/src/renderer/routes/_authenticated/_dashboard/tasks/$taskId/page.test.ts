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

describe("Task detail properties layout", () => {
	it("keeps the right sidebar and Open in workspace controls width-constrained", () => {
		const sidebarSource = readTaskDetailFile(
			"components/PropertiesSidebar/PropertiesSidebar.tsx",
		);
		const openInWorkspaceSource = readTaskDetailFile(
			"components/PropertiesSidebar/components/OpenInWorkspaceV2/OpenInWorkspaceV2.tsx",
		);
		const devicePickerSource = readTaskDetailFile(
			"../../../components/DashboardNewWorkspaceModal/components/DashboardNewWorkspaceForm/components/DevicePicker/DevicePicker.tsx",
		);
		const agentSelectSource = readTaskDetailFile(
			"../../../../../components/AgentSelect/AgentSelect.tsx",
		);

		expect(sidebarSource).toContain("w-64 min-w-0");
		expect(sidebarSource).toContain("overflow-hidden");
		expect(sidebarSource).toContain("h-full min-w-0 overflow-y-auto");
		expect(sidebarSource).toContain("w-full min-w-0 max-w-full");
		expect(sidebarSource).not.toContain("@superset/ui/scroll-area");
		expect(openInWorkspaceSource).toContain("flex min-w-0 max-w-full flex-col");
		expect(openInWorkspaceSource).toContain(
			'className="h-8 w-full max-w-full min-w-0"',
		);
		expect(openInWorkspaceSource).toContain("flex min-w-0 max-w-full gap-1.5");
		expect(openInWorkspaceSource).toContain(
			'triggerClassName="h-8 w-full min-w-0 max-w-full text-xs"',
		);
		expect(devicePickerSource).toContain("max-w-[140px] overflow-hidden");
		expect(devicePickerSource).toContain("min-w-0 flex-1 truncate");
		expect(agentSelectSource).toContain("[&_[data-slot=select-value]]:min-w-0");
		expect(agentSelectSource).toContain("min-w-0 truncate");
	});
});
