import { describe, expect, it } from "bun:test";
import {
	createSidebarGroup,
	deleteSidebarGroup,
	ensureSidebarWorkspaceRecord,
	getSidebarStateSnapshot,
	moveSidebarWorkspaceToGroup,
	renameSidebarGroup,
	setSidebarGroupCollapsed,
} from "./sidebarGroupMutations";

function makeCollection<T>(getKey: (item: T) => string) {
	const state = new Map<string, T>();
	return {
		state,
		get: (key: string) => state.get(key),
		insert: (item: T) => state.set(getKey(item), structuredClone(item)),
		update: (key: string, producer: (draft: T) => void) => {
			const existing = state.get(key);
			if (!existing) return;
			const draft = structuredClone(existing);
			producer(draft);
			state.set(key, draft);
		},
		delete: (key: string) => state.delete(key),
	};
}

type ProjectRow = {
	projectId: string;
	createdAt: Date;
	tabOrder: number;
	isCollapsed: boolean;
};
type GroupRow = {
	sectionId: string;
	projectId: string;
	name: string;
	createdAt: Date;
	tabOrder: number;
	isCollapsed: boolean;
	color: string | null;
};
type WorkspaceRow = {
	workspaceId: string;
	createdAt: Date;
	sidebarState: {
		projectId: string;
		tabOrder: number;
		sectionId: string | null;
		isHidden: boolean;
	};
	paneLayout?: unknown;
};

function makeCollections() {
	return {
		v2SidebarProjects: makeCollection<ProjectRow>((row) => row.projectId),
		v2SidebarSections: makeCollection<GroupRow>((row) => row.sectionId),
		v2WorkspaceLocalState: makeCollection<WorkspaceRow>(
			(row) => row.workspaceId,
		),
	};
}

type Collections = ReturnType<typeof makeCollections>;
type MutationCollections = Parameters<typeof createSidebarGroup>[0];
const asMutationCollections = (collections: Collections) =>
	collections as unknown as MutationCollections;

function addWorkspace(
	collections: Collections,
	workspaceId: string,
	projectId: string,
	tabOrder: number,
	groupId: string | null = null,
): void {
	collections.v2WorkspaceLocalState.insert({
		workspaceId,
		createdAt: new Date("2026-01-01T00:00:00.000Z"),
		sidebarState: {
			projectId,
			tabOrder,
			sectionId: groupId,
			isHidden: false,
		},
	});
}

describe("sidebar group mutations", () => {
	it("creates a named group and ensures its project is visible", () => {
		const collections = makeCollections();
		addWorkspace(collections, "workspace-1", "project-1", 1);

		const id = createSidebarGroup(asMutationCollections(collections), {
			groupId: "group-1",
			projectId: "project-1",
			name: "CLI review",
		});

		expect(id).toBe("group-1");
		expect(collections.v2SidebarProjects.get("project-1")).toBeDefined();
		expect(collections.v2SidebarSections.get("group-1")).toMatchObject({
			name: "CLI review",
			projectId: "project-1",
			tabOrder: 2,
			isCollapsed: false,
		});
	});

	it("moves workspaces, renames the group, and sets collapse state", () => {
		const collections = makeCollections();
		addWorkspace(collections, "workspace-1", "project-1", 1);
		createSidebarGroup(asMutationCollections(collections), {
			groupId: "group-1",
			projectId: "project-1",
			name: "Draft",
		});

		moveSidebarWorkspaceToGroup(
			asMutationCollections(collections),
			"workspace-1",
			"group-1",
		);
		renameSidebarGroup(asMutationCollections(collections), "group-1", "Ready");
		setSidebarGroupCollapsed(
			asMutationCollections(collections),
			"group-1",
			true,
		);

		expect(
			collections.v2WorkspaceLocalState.get("workspace-1")?.sidebarState
				.sectionId,
		).toBe("group-1");
		expect(collections.v2SidebarSections.get("group-1")).toMatchObject({
			name: "Ready",
			isCollapsed: true,
		});
	});

	it("materializes a rowless main workspace before moving it", () => {
		const collections = makeCollections();
		createSidebarGroup(asMutationCollections(collections), {
			groupId: "group-1",
			projectId: "project-1",
			name: "Main workspace",
		});

		ensureSidebarWorkspaceRecord(
			asMutationCollections(collections),
			"workspace-rowless",
			"project-1",
		);
		moveSidebarWorkspaceToGroup(
			asMutationCollections(collections),
			"workspace-rowless",
			"group-1",
		);

		expect(
			collections.v2WorkspaceLocalState.get("workspace-rowless"),
		).toMatchObject({
			workspaceId: "workspace-rowless",
			sidebarState: {
				projectId: "project-1",
				sectionId: "group-1",
				isHidden: false,
			},
		});
	});

	it("deleting a group ungroups its workspaces without deleting them", () => {
		const collections = makeCollections();
		collections.v2SidebarSections.insert({
			sectionId: "group-1",
			projectId: "project-1",
			name: "Disposable",
			createdAt: new Date(),
			tabOrder: 1,
			isCollapsed: false,
			color: null,
		});
		addWorkspace(collections, "workspace-1", "project-1", 1, "group-1");
		addWorkspace(collections, "workspace-2", "project-1", 2, "group-1");

		deleteSidebarGroup(asMutationCollections(collections), "group-1");

		expect(collections.v2SidebarSections.get("group-1")).toBeUndefined();
		expect(collections.v2WorkspaceLocalState.state.size).toBe(2);
		expect(
			Array.from(collections.v2WorkspaceLocalState.state.values()).map(
				(row) => row.sidebarState.sectionId,
			),
		).toEqual([null, null]);
	});

	it("returns a stable snapshot and rejects cross-project moves", () => {
		const collections = makeCollections();
		collections.v2SidebarSections.insert({
			sectionId: "group-1",
			projectId: "project-1",
			name: "One",
			createdAt: new Date(),
			tabOrder: 1,
			isCollapsed: false,
			color: null,
		});
		addWorkspace(collections, "workspace-2", "project-2", 1);

		expect(() =>
			moveSidebarWorkspaceToGroup(
				asMutationCollections(collections),
				"workspace-2",
				"group-1",
			),
		).toThrow("same project");
		expect(getSidebarStateSnapshot(asMutationCollections(collections))).toEqual(
			{
				groups: [
					{
						id: "group-1",
						projectId: "project-1",
						name: "One",
						tabOrder: 1,
						isCollapsed: false,
						color: null,
					},
				],
				workspaces: [
					{
						id: "workspace-2",
						projectId: "project-2",
						groupId: null,
						tabOrder: 1,
					},
				],
			},
		);
	});
});
