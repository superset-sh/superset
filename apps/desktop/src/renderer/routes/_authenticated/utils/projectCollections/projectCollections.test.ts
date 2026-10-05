import { describe, expect, test } from "bun:test";
import { PROJECTS_TAG_SCOPE } from "@superset/shared/workspace-tags";
import type {
	HostTagFolderSetting,
	HostTagFoldersResult,
} from "renderer/hooks/host-projects/useHostTagFolders/useHostTagFolders.utils";
import {
	deriveProjectCollections,
	projectCollectionId,
} from "./projectCollections";

const project = (id: string, tags: string[] = []) => ({ id, name: id, tags });
const setting = (
	tag: string,
	tabOrder: number | null = null,
	displayName: string | null = null,
): HostTagFolderSetting => ({
	scope: PROJECTS_TAG_SCOPE,
	tag,
	tabOrder,
	displayName,
	color: null,
});
const host = (
	machineId: string,
	settings: HostTagFolderSetting[],
	isLocal = false,
): HostTagFoldersResult => ({
	target: { machineId, organizationId: "org", isLocal, hostUrl: machineId },
	status: "ready",
	settings,
});
const placement = (tag: string, tabOrder: number, isCollapsed = false) => ({
	sectionId: projectCollectionId(tag),
	projectId: PROJECTS_TAG_SCOPE,
	name: tag,
	tag,
	color: null,
	createdAt: new Date(0),
	tabOrder,
	isCollapsed,
});
const rootIds = (result: ReturnType<typeof deriveProjectCollections>) =>
	result.rootItems.map((row) =>
		row.type === "project" ? row.project.id : row.collection.tag,
	);

describe("project collections", () => {
	test("unions tags and settings, including empty collections from another host", () => {
		const result = deriveProjectCollections({
			projects: [project("one", [" Team ", "team"]), project("loose")],
			hostResults: [
				host("remote", [
					setting("empty"),
					{ ...setting("ignored"), scope: "sessions" },
				]),
			],
		});
		expect(result.collections.map((row) => row.tag)).toEqual(["empty", "team"]);
		expect(
			result.collections.find((row) => row.tag === "empty")?.projects,
		).toEqual([]);
		expect(
			result.collections
				.find((row) => row.tag === "team")
				?.projects.map((row) => row.id),
		).toEqual(["one"]);
		expect(rootIds(result)).toEqual(["loose", "empty", "team"]);
	});
	test("local settings win as one row, including explicit null resets", () => {
		const local = host("z", [setting("team", null, null)], true);
		const remote = host("a", [
			{ ...setting("team", 1, "Remote"), color: "#ff0000" },
		]);
		for (const hosts of [
			[local, remote],
			[remote, local],
		]) {
			const result = deriveProjectCollections({
				projects: [],
				hostResults: hosts,
			});
			expect(result.collections[0]).toMatchObject({
				name: "team",
				color: null,
				tabOrder: 1_000_000,
			});
		}
	});
	test("remote precedence is machine identity rather than completion order", () => {
		const result = deriveProjectCollections({
			projects: [],
			hostResults: [
				host("z", [setting("team", 2, "Z")]),
				host("a", [setting("team", 4, "A")]),
			],
		});
		expect(result.collections[0]).toMatchObject({ name: "A", tabOrder: 4 });
	});
	test("one container per project, lowest order then tag, local order overrides host", () => {
		const result = deriveProjectCollections({
			projects: [project("one", ["z", "a", "first"])],
			hostResults: [
				host(
					"local",
					[setting("z", 1), setting("a", 1), setting("first", 0)],
					true,
				),
			],
			placements: [placement("first", 10)],
		});
		expect(result.collectionByProjectId.get("one")?.tag).toBe("a");
		expect(result.collections.flatMap((row) => row.projects)).toHaveLength(1);
	});
	test("root has mixed manual order and each collection has its own manual order", () => {
		const result = deriveProjectCollections({
			projects: [
				project("a", ["team"]),
				project("b", ["team"]),
				project("root"),
			],
			hostResults: [],
			placements: [placement("team", 2)],
			projectPlacements: [
				{ projectId: "a", tabOrder: 3, isHidden: false },
				{ projectId: "b", tabOrder: 1, isHidden: false },
				{ projectId: "root", tabOrder: 4, isHidden: false },
			],
		});
		expect(rootIds(result)).toEqual(["team", "root"]);
		expect(result.collections[0]?.projects.map((row) => row.id)).toEqual([
			"b",
			"a",
		]);
	});
	test("hidden projects make a collection empty, default keeps it visible", () => {
		const input = {
			projects: [project("one", ["team"])],
			hostResults: [],
			projectPlacements: [{ projectId: "one", tabOrder: 0, isHidden: true }],
		};
		expect(rootIds(deriveProjectCollections(input))).toEqual(["team"]);
		expect(
			rootIds(deriveProjectCollections({ ...input, hideEmpty: true })),
		).toEqual([]);
	});
	test("filter matches collection or project and expands without changing collapse", () => {
		const input = {
			projects: [
				project("one", ["team"]),
				project("two", ["team"]),
				project("other", ["empty"]),
			],
			hostResults: [host("local", [setting("team", 1, "Dibsteur")])],
			placements: [placement("team", 1, true)],
		};
		const byName = deriveProjectCollections({ ...input, filter: " dibsteur " });
		expect(byName.rootItems[0]).toMatchObject({
			type: "collection",
			collection: {
				isCollapsed: false,
				projects: [project("one", ["team"]), project("two", ["team"])],
			},
		});
		const byProject = deriveProjectCollections({ ...input, filter: "one" });
		expect(
			byProject.collections
				.find((row) => row.tag === "team")
				?.projects.map((row) => row.id),
		).toEqual(["one"]);
		expect(input.placements[0]?.isCollapsed).toBe(true);
	});
	test("active and created sort members by newest workspace and keep root manual", () => {
		const input = {
			projects: [
				project("a", ["team"]),
				project("b", ["team"]),
				project("root"),
			],
			hostResults: [],
			placements: [placement("team", 5)],
			projectPlacements: [{ projectId: "root", tabOrder: 10, isHidden: false }],
			workspaces: [
				{ projectId: "a", createdAt: 50, updatedAt: 1000, lastActivityAt: 10 },
				{ projectId: "a", createdAt: 20, updatedAt: 1000, lastActivityAt: 30 },
				{ projectId: "b", createdAt: 40, updatedAt: 1, lastActivityAt: 60 },
			],
		};
		expect(
			deriveProjectCollections({
				...input,
				sortMode: "active",
			}).collections[0]?.projects.map((row) => row.id),
		).toEqual(["b", "a"]);
		expect(
			deriveProjectCollections({
				...input,
				sortMode: "created",
			}).collections[0]?.projects.map((row) => row.id),
		).toEqual(["a", "b"]);
		expect(
			rootIds(deriveProjectCollections({ ...input, sortMode: "active" })),
		).toEqual(["team", "root"]);
	});
	test("invalid tags and timestamps cannot destabilize rendering", () => {
		const result = deriveProjectCollections({
			projects: [project("a", ["", "x".repeat(65), "team"])],
			hostResults: [],
			sortMode: "active",
			workspaces: [
				{
					projectId: "a",
					createdAt: "bad",
					updatedAt: "bad",
					lastActivityAt: null,
				},
			],
		});
		expect(result.collections.map((row) => row.tag)).toEqual(["team"]);
	});
});
