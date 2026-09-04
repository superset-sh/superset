import { describe, expect, it } from "bun:test";
import type { AppCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider/collections";
import {
	buildSidebarFolderKey,
	EMPTY_TAG_FOLDER_CONTEXT,
} from "renderer/routes/_authenticated/utils/workspaceTagFolders";
import { getFlattenedV2WorkspaceIds } from "./getFlattenedV2WorkspaceIds";

const PROJECT_ID = "22222222-2222-4222-8222-222222222222";
const DATE = new Date("2026-01-01T00:00:00.000Z");

type Collections = Pick<
	AppCollections,
	"v2SidebarProjects" | "v2SidebarSections" | "v2WorkspaceLocalState"
>;

function fakeCollection<Row>(rows: Row[], key: (row: Row) => string) {
	return { state: new Map(rows.map((row) => [key(row), row])) };
}

function makeCollections(args: {
	projectHidden?: boolean;
	sections?: Array<{
		sectionId: string;
		projectId: string;
		name: string;
		tabOrder: number;
		isCollapsed: boolean;
		color: string | null;
		createdAt: Date;
		tag: string | null;
	}>;
	workspaces: Array<{
		workspaceId: string;
		sectionId?: string | null;
		tabOrder: number;
	}>;
}): Collections {
	return {
		v2SidebarProjects: fakeCollection(
			[
				{
					projectId: PROJECT_ID,
					createdAt: DATE,
					tabOrder: 1,
					isCollapsed: false,
					isHidden: args.projectHidden ?? false,
				},
			],
			(row) => row.projectId,
		),
		v2SidebarSections: fakeCollection(
			args.sections ?? [],
			(row) => row.sectionId,
		),
		v2WorkspaceLocalState: fakeCollection(
			args.workspaces.map((workspace) => ({
				workspaceId: workspace.workspaceId,
				createdAt: DATE,
				sidebarState: {
					projectId: PROJECT_ID,
					tabOrder: workspace.tabOrder,
					sectionId: workspace.sectionId ?? null,
					isHidden: false,
					pinnedAt: null,
				},
			})),
			(row) => row.workspaceId,
		),
	} as unknown as Collections;
}

describe("getFlattenedV2WorkspaceIds with tag folders", () => {
	it("tag-derived members flatten under their folder at the bottom, not as top-level rows", () => {
		const collections = makeCollections({
			workspaces: [
				{ workspaceId: "w-top", tabOrder: 1 },
				{ workspaceId: "w-tagged-late", tabOrder: 3 },
				{ workspaceId: "w-tagged-early", tabOrder: 2 },
			],
		});
		const hostWorkspaces = [
			{ id: "w-top", projectId: PROJECT_ID, tags: [] },
			{ id: "w-tagged-late", projectId: PROJECT_ID, tags: ["perf"] },
			{ id: "w-tagged-early", projectId: PROJECT_ID, tags: ["perf"] },
		];

		// Derived folders order at the synthetic tabOrder floor (bottom of the
		// lane); members order by their own local tabOrder within the folder.
		expect(
			getFlattenedV2WorkspaceIds(
				collections,
				hostWorkspaces,
				EMPTY_TAG_FOLDER_CONTEXT,
			),
		).toEqual(["w-top", "w-tagged-early", "w-tagged-late"]);
	});

	it("matches the builder's resolver: stale pointer at a tag-backed folder goes top-level", () => {
		const perfKey = buildSidebarFolderKey(PROJECT_ID, "perf");
		const collections = makeCollections({
			workspaces: [
				{ workspaceId: "w-stale", sectionId: perfKey, tabOrder: 1 },
				{ workspaceId: "w-tagged", tabOrder: 2 },
			],
		});
		const hostWorkspaces = [
			{ id: "w-stale", projectId: PROJECT_ID, tags: [] },
			{ id: "w-tagged", projectId: PROJECT_ID, tags: ["perf"] },
		];

		expect(
			getFlattenedV2WorkspaceIds(
				collections,
				hostWorkspaces,
				EMPTY_TAG_FOLDER_CONTEXT,
			),
		).toEqual(["w-stale", "w-tagged"]);
	});

	it("legacy sections keep flattening by sectionId when no tags are involved", () => {
		const collections = makeCollections({
			sections: [
				{
					sectionId: "33333333-3333-4333-8333-333333333333",
					projectId: PROJECT_ID,
					name: "Legacy",
					tabOrder: 1,
					isCollapsed: false,
					color: null,
					createdAt: DATE,
					tag: null,
				},
			],
			workspaces: [
				{
					workspaceId: "w-member",
					sectionId: "33333333-3333-4333-8333-333333333333",
					tabOrder: 1,
				},
				{ workspaceId: "w-below", tabOrder: 2 },
			],
		});
		// Host rows with the tags field ABSENT — an older host's shape.
		const hostWorkspaces = [
			{ id: "w-member", projectId: PROJECT_ID },
			{ id: "w-below", projectId: PROJECT_ID },
		];

		expect(
			getFlattenedV2WorkspaceIds(
				collections,
				hostWorkspaces,
				EMPTY_TAG_FOLDER_CONTEXT,
			),
		).toEqual(["w-member", "w-below"]);
	});

	it("skips every workspace of a hidden project so removal never navigates into it", () => {
		const collections = makeCollections({
			projectHidden: true,
			workspaces: [
				{ workspaceId: "w-one", tabOrder: 1 },
				{ workspaceId: "w-two", tabOrder: 2 },
			],
		});
		const hostWorkspaces = [
			{ id: "w-one", projectId: PROJECT_ID, tags: [] },
			{ id: "w-two", projectId: PROJECT_ID, tags: [] },
		];

		expect(
			getFlattenedV2WorkspaceIds(
				collections,
				hostWorkspaces,
				EMPTY_TAG_FOLDER_CONTEXT,
			),
		).toEqual([]);
	});
});
