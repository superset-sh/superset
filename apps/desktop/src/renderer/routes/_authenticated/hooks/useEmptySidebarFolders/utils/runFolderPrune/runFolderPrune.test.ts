import { describe, expect, it, mock } from "bun:test";
import {
	type FindOrphanedTagFoldersInput,
	findOrphanedTagFolders,
	type OrphanedTagFolder,
	type UnverifiedTagFolder,
} from "renderer/routes/_authenticated/utils/workspaceTagFolders";
import type { FolderGroup } from "../../types";
import { type FolderPruneSnapshot, runFolderPrune } from "./runFolderPrune";

const PROJECT_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const PROJECT_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

function inputFor(
	projectId: string,
	tags: string[],
): FindOrphanedTagFoldersInput {
	return {
		sections: tags.map((tag) => ({
			sectionId: `${projectId}:${tag}`,
			projectId,
			name: tag,
			tag,
		})),
		workspaces: [],
		hostReads: [
			{
				isLocal: true,
				live: true,
				projectIds: [projectId],
				projectsLive: true,
			},
		],
		rosterLive: true,
		cloudLive: true,
		hiddenTagsByProject: new Map(),
		sessionsSettingHostKnown: true,
	};
}

function groups(folders: readonly OrphanedTagFolder[]): FolderGroup[] {
	return folders.map((folder) => ({
		sectionIds: [folder.sectionId],
		folder: {
			scope: folder.scope,
			projectId: folder.scope,
			projectName: null,
			tag: folder.tag,
			name: folder.name,
		},
	}));
}

function snapshotFor(
	organizationId: string,
	findInput: FindOrphanedTagFoldersInput,
	hostUrl: string,
): FolderPruneSnapshot {
	return {
		organizationId,
		findInput,
		groupFolders: groups,
		toSkipped: (folders: readonly UnverifiedTagFolder[]) =>
			groups(folders).map(({ folder }, index) => ({
				...folder,
				reason: folders[index]?.reason ?? "unanswered",
			})),
		resolveSettingHostUrls: () => [hostUrl],
	};
}

const orgA = snapshotFor(
	"org-a",
	inputFor(PROJECT_A, ["perf", "docs"]),
	"host-a",
);
const orgB = snapshotFor(
	"org-b",
	inputFor(PROJECT_B, ["perf", "docs"]),
	"host-b",
);

function setup() {
	let latest = orgA;
	const deleteHostSetting = mock(
		async (_url: string, _scope: string, _tag: string) => {},
	);
	const deleteRows = mock((_sectionIds: readonly string[]) => {});
	return {
		switchToB: () => {
			latest = orgB;
		},
		changeA: (
			change: (
				input: FindOrphanedTagFoldersInput,
			) => FindOrphanedTagFoldersInput,
		) => {
			latest = { ...latest, findInput: change(latest.findInput) };
		},
		deleteHostSetting,
		deleteRows,
		run: (refresh: () => Promise<FindOrphanedTagFoldersInput>) =>
			runFolderPrune({
				dryRun: false,
				readLatest: () => latest,
				refresh,
				deleteHostSetting,
				deleteRows,
			}),
	};
}

describe("runFolderPrune", () => {
	it("removes every empty folder of the organization it started in", async () => {
		const { run, deleteHostSetting, deleteRows } = setup();
		const result = await run(async () => orgA.findInput);
		expect(result.removed.map(({ tag }) => tag)).toEqual(["perf", "docs"]);
		expect(deleteHostSetting.mock.calls).toEqual([
			["host-a", PROJECT_A, "perf"],
			["host-a", PROJECT_A, "docs"],
		]);
		expect(deleteRows).toHaveBeenCalledTimes(2);
	});

	it("deletes nothing when the window switches organization while sources refresh", async () => {
		const { run, switchToB, deleteHostSetting, deleteRows } = setup();
		const result = await run(async () => {
			switchToB();
			return orgB.findInput;
		});
		expect(deleteHostSetting).not.toHaveBeenCalled();
		expect(deleteRows).not.toHaveBeenCalled();
		expect(result.removed).toEqual([]);
		expect(
			result.skipped.map(({ scope, tag, reason }) => [scope, tag, reason]),
		).toEqual([
			[PROJECT_A, "perf", "organizationChanged"],
			[PROJECT_A, "docs", "organizationChanged"],
		]);
	});

	it("stops at the next step when the window switches organization mid-prune", async () => {
		const { run, switchToB, deleteHostSetting, deleteRows } = setup();
		deleteHostSetting.mockImplementationOnce(async () => {
			switchToB();
		});
		const result = await run(async () => orgA.findInput);
		expect(deleteHostSetting.mock.calls).toEqual([
			["host-a", PROJECT_A, "perf"],
		]);
		expect(deleteRows).not.toHaveBeenCalled();
		expect(result.removed).toEqual([]);
		expect(result.skipped.map(({ tag, reason }) => [tag, reason])).toEqual([
			["perf", "organizationChanged"],
			["docs", "organizationChanged"],
		]);
		expect(deleteHostSetting.mock.calls.some(([url]) => url === "host-b")).toBe(
			false,
		);
	});

	it.each([
		[
			"a workspace takes its tag",
			(input: FindOrphanedTagFoldersInput) => ({
				...input,
				workspaces: [{ id: "w1", projectId: PROJECT_A, tags: ["docs"] }],
			}),
		],
		[
			"it is hidden",
			(input: FindOrphanedTagFoldersInput) => ({
				...input,
				hiddenTagsByProject: new Map([[PROJECT_A, new Set(["docs"])]]),
			}),
		],
	])("sends no deletes for a later folder when %s while an earlier delete is pending", async (_name, change) => {
		const { run, changeA, deleteHostSetting, deleteRows } = setup();
		deleteHostSetting.mockImplementationOnce(async () => {
			changeA(change);
		});
		const result = await run(async () => orgA.findInput);
		expect(deleteHostSetting.mock.calls).toEqual([
			["host-a", PROJECT_A, "perf"],
		]);
		expect(deleteRows.mock.calls).toEqual([[[`${PROJECT_A}:perf`]]]);
		expect(result.removed.map(({ tag }) => tag)).toEqual(["perf"]);
		expect(result.skipped.map(({ tag, reason }) => [tag, reason])).toEqual([
			["docs", "noLongerEmpty"],
		]);
	});

	it("lists without deleting on a dry run", async () => {
		const { deleteHostSetting, deleteRows } = setup();
		const result = await runFolderPrune({
			dryRun: true,
			readLatest: () => orgA,
			refresh: async () => orgA.findInput,
			deleteHostSetting,
			deleteRows,
		});
		expect(result.removed.map(({ tag }) => tag)).toEqual(["perf", "docs"]);
		expect(deleteHostSetting).not.toHaveBeenCalled();
		expect(deleteRows).not.toHaveBeenCalled();
		expect(findOrphanedTagFolders(orgA.findInput).orphaned).toHaveLength(2);
	});
});
