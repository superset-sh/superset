import { beforeEach, describe, expect, mock, test } from "bun:test";
import type { SidebarFolderPruneResult } from "@superset/shared/sidebar-folders";
import { withLocalHostService } from "../../../../lib/host/test-helpers";
import command from "./command";

let pruneError: Error | null = null;
let pruneResult: SidebarFolderPruneResult = {
	dryRun: false,
	removed: [],
	skipped: [],
	failed: [],
};

const prune = mock(async (_input: Record<string, unknown>) => {
	if (pruneError) throw pruneError;
	return pruneResult;
});

withLocalHostService("org-1", {
	"sidebar.pruneEmptyFolders": prune as never,
});

function invoke(options: Record<string, unknown> = {}) {
	return command.run({
		ctx: { config: { organizationId: "org-1" }, bearer: "bearer" } as never,
		args: {} as never,
		options: options as never,
		signal: new AbortController().signal,
	}) as Promise<{ data: SidebarFolderPruneResult; message: string }>;
}

beforeEach(() => {
	pruneError = null;
	prune.mockClear();
});

describe("workspaces folders prune", () => {
	test("asks this machine's host and reports each folder", async () => {
		pruneResult = {
			dryRun: false,
			removed: [
				{ projectId: "p-1", projectName: "web", tag: "old", name: "Old work" },
			],
			skipped: [
				{
					projectId: null,
					projectName: null,
					tag: "scratch",
					name: "scratch",
					reason: "settingHostsUnknown",
				},
			],
			failed: [],
		};
		const result = await invoke({ project: "p-1" });
		expect(prune).toHaveBeenLastCalledWith({ projectId: "p-1", dryRun: false });
		expect(result.data).toEqual(pruneResult);
		expect(result.message).toStartWith("Removed 1 empty folder; skipped 1.");
		expect(result.message).toContain(
			"not every host that keeps its settings is known yet",
		);
		expect(result.message).toContain("removed");
		expect(result.message).toContain("Old work");
		expect(result.message).toContain("sessions");
	});

	test("a dry run lists what would go", async () => {
		pruneResult = {
			dryRun: true,
			removed: [
				{ projectId: "p-1", projectName: "web", tag: "a", name: "a" },
				{ projectId: "p-1", projectName: "web", tag: "b", name: "b" },
			],
			skipped: [],
			failed: [],
		};
		const result = await invoke({ dryRun: true });
		expect(prune).toHaveBeenLastCalledWith({ dryRun: true });
		expect(result.message).toStartWith("Would remove 2 empty folders.");
		expect(result.message).toContain("would remove");
	});

	test("lists why a folder could not be removed", async () => {
		pruneResult = {
			dryRun: false,
			removed: [],
			skipped: [],
			failed: [
				{
					projectId: "p-1",
					projectName: "web",
					tag: "old",
					name: "Old work",
					error: "Host unreachable",
				},
			],
		};
		const result = await invoke();
		expect(result.message).toStartWith("Removed 0 empty folders; 1 failed.");
		expect(result.message).toContain("failed");
		expect(result.message).toContain("Host unreachable");
	});

	test("names an old host instead of a missing procedure", async () => {
		pruneError = new Error(
			'No procedure found on path "sidebar.pruneEmptyFolders"',
		);
		await expect(invoke()).rejects.toThrow("too old to remove empty folders");
	});

	test("passes on why the desktop app could not serve it", async () => {
		pruneError = new Error(
			"No desktop window is open on this organization. Open one, then try again.",
		);
		await expect(invoke()).rejects.toThrow(
			"No desktop window is open on this organization",
		);
	});
});
