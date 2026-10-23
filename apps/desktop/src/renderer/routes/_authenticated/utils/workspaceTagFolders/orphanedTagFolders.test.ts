import { describe, expect, it } from "bun:test";
import { SESSIONS_TAG_SCOPE } from "@superset/shared/workspace-tags";
import {
	type FindOrphanedTagFoldersInput,
	findOrphanedTagFolders,
} from "./orphanedTagFolders";
import { buildSidebarFolderKey } from "./workspaceTagFolders";

const PROJECT_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const PROJECT_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

function row(projectId: string, tag: string | null, name = tag ?? "legacy") {
	return {
		sectionId:
			tag === null ? `legacy-${name}` : buildSidebarFolderKey(projectId, tag),
		projectId,
		name,
		tag,
	};
}

function find(overrides: Partial<FindOrphanedTagFoldersInput>) {
	return findOrphanedTagFolders({
		sections: [],
		workspaces: [],
		hostReads: [
			{
				isLocal: true,
				live: true,
				projectIds: [PROJECT_A, PROJECT_B],
				projectsLive: true,
			},
		],
		rosterLive: true,
		cloudLive: true,
		hiddenTagsByProject: new Map(),
		sessionsSettingHostKnown: true,
		...overrides,
	});
}

const tagsOf = (folders: { tag: string }[]) => folders.map(({ tag }) => tag);

describe("findOrphanedTagFolders", () => {
	it("lists a stored tag folder that no workspace carries", () => {
		const result = find({
			sections: [row(PROJECT_A, "perf"), row(PROJECT_A, "docs")],
			workspaces: [{ id: "w1", projectId: PROJECT_A, tags: ["docs"] }],
		});
		expect(result.orphaned).toEqual([
			{
				sectionId: buildSidebarFolderKey(PROJECT_A, "perf"),
				scope: PROJECT_A,
				tag: "perf",
				name: "perf",
			},
		]);
		expect(result.unverified).toEqual([]);
	});

	it("keeps a folder whose tag is carried by a workspace that renders in another folder", () => {
		const result = find({
			sections: [row(PROJECT_A, "a"), row(PROJECT_A, "b")],
			workspaces: [{ id: "w1", projectId: PROJECT_A, tags: ["a", "b"] }],
		});
		expect(result.orphaned).toEqual([]);
	});

	it("keeps a folder whose tag is carried on another host", () => {
		const result = find({
			sections: [row(PROJECT_A, "perf")],
			workspaces: [{ id: "remote", projectId: PROJECT_A, tags: ["Perf"] }],
			hostReads: [
				{
					isLocal: true,
					live: true,
					projectIds: [PROJECT_A],
					projectsLive: true,
				},
				{
					isLocal: false,
					live: true,
					projectIds: [PROJECT_A],
					projectsLive: true,
				},
			],
		});
		expect(result.orphaned).toEqual([]);
	});

	it("keeps a folder whose tag only a cloud workspace carries, placed or not", () => {
		expect(
			find({
				sections: [row(PROJECT_A, "perf")],
				workspaces: [{ id: "cloud", projectId: PROJECT_A, tags: ["perf"] }],
			}).orphaned,
		).toEqual([]);
		expect(
			find({
				sections: [row(PROJECT_A, "perf"), row(PROJECT_B, "perf")],
				workspaces: [{ id: "cloud", projectId: undefined, tags: ["perf"] }],
			}).orphaned,
		).toEqual([]);
	});

	it("keeps a folder whose only member is pinned", () => {
		const result = find({
			sections: [row(PROJECT_A, "perf")],
			workspaces: [{ id: "pinned", projectId: PROJECT_A, tags: ["perf"] }],
		});
		expect(result.orphaned).toEqual([]);
	});

	it("does not let a tag in one project keep another project's folder", () => {
		const result = find({
			sections: [row(PROJECT_A, "perf"), row(PROJECT_B, "perf")],
			workspaces: [{ id: "w1", projectId: PROJECT_B, tags: ["perf"] }],
		});
		expect(result.orphaned.map(({ scope }) => scope)).toEqual([PROJECT_A]);
	});

	it("handles the Sessions lane as its own scope", () => {
		const result = find({
			sections: [
				row(SESSIONS_TAG_SCOPE, "scratch"),
				row(SESSIONS_TAG_SCOPE, "agents"),
			],
			workspaces: [
				{ id: "session", projectId: null, tags: ["agents"] },
				{ id: "project", projectId: PROJECT_A, tags: ["scratch"] },
			],
		});
		expect(result.orphaned).toEqual([
			{
				sectionId: buildSidebarFolderKey(SESSIONS_TAG_SCOPE, "scratch"),
				scope: SESSIONS_TAG_SCOPE,
				tag: "scratch",
				name: "scratch",
			},
		]);
	});

	it("never lists legacy rows or hidden folders", () => {
		const result = find({
			sections: [row(PROJECT_A, null, "Old group"), row(PROJECT_A, "perf")],
			hiddenTagsByProject: new Map([[PROJECT_A, new Set(["perf"])]]),
		});
		expect(result).toEqual({ orphaned: [], unverified: [] });
	});

	it("holds back only the scopes a failed or offline host serves", () => {
		const result = find({
			sections: [
				row(PROJECT_A, "perf"),
				row(PROJECT_B, "perf"),
				row(SESSIONS_TAG_SCOPE, "perf"),
			],
			hostReads: [
				{
					isLocal: true,
					live: true,
					projectIds: [PROJECT_A],
					projectsLive: true,
				},
				{
					isLocal: false,
					live: false,
					projectIds: [PROJECT_B],
					projectsLive: true,
				},
			],
		});
		expect(result.orphaned.map(({ scope }) => scope)).toEqual([PROJECT_A]);
		expect(result.unverified.map(({ scope }) => scope)).toEqual([
			PROJECT_B,
			SESSIONS_TAG_SCOPE,
		]);
	});

	it.each([
		[
			"a host whose projects are unknown is not live",
			{
				hostReads: [
					{
						isLocal: true,
						live: true,
						projectIds: [PROJECT_A],
						projectsLive: true,
					},
					{ isLocal: false, live: false, projectIds: null, projectsLive: true },
				],
			},
		],
		[
			"the local host has not answered",
			{
				hostReads: [
					{ isLocal: true, live: false, projectIds: [], projectsLive: true },
				],
			},
		],
		["the host roster is a cached copy", { rosterLive: false }],
		["the cloud list has not answered", { cloudLive: false }],
	])("holds back every scope when %s", (_name, overrides) => {
		const result = find({
			sections: [row(PROJECT_A, "perf")],
			...overrides,
		});
		expect(result.orphaned).toEqual([]);
		expect(tagsOf(result.unverified)).toEqual(["perf"]);
	});

	it.each([
		["pending", null],
		["failed after an earlier read", [PROJECT_A]],
	])("holds back project folders while a live host's project discovery is %s", (_name, projectIds) => {
		const result = find({
			sections: [
				row(PROJECT_A, "perf"),
				row(PROJECT_B, "perf"),
				row(SESSIONS_TAG_SCOPE, "perf"),
			],
			hostReads: [
				{ isLocal: true, live: true, projectIds, projectsLive: false },
			],
		});
		expect(result.orphaned.map(({ scope }) => scope)).toEqual([
			SESSIONS_TAG_SCOPE,
		]);
		expect(
			result.unverified.map(({ scope, reason }) => [scope, reason]),
		).toEqual([
			[PROJECT_A, "settingHostsUnknown"],
			[PROJECT_B, "settingHostsUnknown"],
		]);
	});

	it("holds back Sessions folders while the active host is unknown", () => {
		const result = find({
			sections: [row(PROJECT_A, "perf"), row(SESSIONS_TAG_SCOPE, "perf")],
			sessionsSettingHostKnown: false,
		});
		expect(result.orphaned.map(({ scope }) => scope)).toEqual([PROJECT_A]);
		expect(result.unverified).toEqual([
			expect.objectContaining({
				scope: SESSIONS_TAG_SCOPE,
				reason: "settingHostsUnknown",
			}),
		]);
	});

	it("reports an unanswered scope as unanswered, not as unknown hosts", () => {
		const result = find({
			sections: [row(PROJECT_A, "perf")],
			hostReads: [
				{ isLocal: true, live: true, projectIds: null, projectsLive: false },
			],
			cloudLive: false,
		});
		expect(result.unverified.map(({ reason }) => reason)).toEqual([
			"unanswered",
		]);
	});

	it("limits the result to one scope", () => {
		const result = find({
			sections: [row(PROJECT_A, "a"), row(PROJECT_B, "b")],
			scope: PROJECT_B,
		});
		expect(tagsOf(result.orphaned)).toEqual(["b"]);
	});
});
