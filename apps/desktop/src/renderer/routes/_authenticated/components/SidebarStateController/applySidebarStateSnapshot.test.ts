import { describe, expect, test } from "bun:test";
import {
	applySidebarStateSnapshot,
	getSidebarStateSnapshot,
} from "./applySidebarStateSnapshot";

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

function makeCollections() {
	return {
		v2SidebarProjects: makeCollection<{
			projectId: string;
			createdAt: Date;
			tabOrder: number;
			isCollapsed: boolean;
		}>((row) => row.projectId),
		v2SidebarSections: makeCollection<{
			sectionId: string;
			projectId: string;
			name: string;
			createdAt: Date;
			tabOrder: number;
			isCollapsed: boolean;
			color: string | null;
		}>((row) => row.sectionId),
		v2WorkspaceLocalState: makeCollection<{
			workspaceId: string;
			createdAt: Date;
			sidebarState: {
				projectId: string;
				tabOrder: number;
				sectionId: string | null;
				isHidden: boolean;
			};
			paneLayout: unknown;
		}>((row) => row.workspaceId),
	};
}

type SnapshotCollections = Parameters<typeof applySidebarStateSnapshot>[0];

describe("sidebar state collection synchronization", () => {
	test("updates only sidebar fields and preserves workspace pane state", () => {
		const collections = makeCollections();
		collections.v2WorkspaceLocalState.insert({
			workspaceId: "workspace-1",
			createdAt: new Date("2026-01-01T00:00:00.000Z"),
			sidebarState: {
				projectId: "project-1",
				tabOrder: 1,
				sectionId: null,
				isHidden: false,
			},
			paneLayout: { tabs: ["must-survive"] },
		});

		applySidebarStateSnapshot(collections as unknown as SnapshotCollections, {
			projects: [{ id: "project-1", tabOrder: 1, isCollapsed: false }],
			groups: [
				{
					id: "group-1",
					projectId: "project-1",
					name: "Review",
					tabOrder: 1,
					isCollapsed: false,
					color: null,
				},
			],
			workspaces: [
				{
					id: "workspace-1",
					projectId: "project-1",
					groupId: "group-1",
					tabOrder: 2,
					isHidden: false,
				},
			],
		});

		expect(collections.v2WorkspaceLocalState.get("workspace-1")).toMatchObject({
			paneLayout: { tabs: ["must-survive"] },
			sidebarState: { sectionId: "group-1", tabOrder: 2 },
		});
	});

	test("round-trips collapsed, colored, and hidden state", () => {
		const collections = makeCollections();
		collections.v2SidebarProjects.insert({
			projectId: "project-1",
			createdAt: new Date(),
			tabOrder: 1,
			isCollapsed: true,
		});
		collections.v2SidebarSections.insert({
			sectionId: "group-1",
			projectId: "project-1",
			name: "Review",
			createdAt: new Date(),
			tabOrder: 2,
			isCollapsed: true,
			color: "orange",
		});
		collections.v2WorkspaceLocalState.insert({
			workspaceId: "workspace-1",
			createdAt: new Date(),
			sidebarState: {
				projectId: "project-1",
				tabOrder: 3,
				sectionId: "group-1",
				isHidden: true,
			},
			paneLayout: {},
		});

		expect(
			getSidebarStateSnapshot(collections as unknown as SnapshotCollections),
		).toEqual({
			projects: [{ id: "project-1", tabOrder: 1, isCollapsed: true }],
			groups: [
				{
					id: "group-1",
					projectId: "project-1",
					name: "Review",
					tabOrder: 2,
					isCollapsed: true,
					color: "orange",
				},
			],
			workspaces: [
				{
					id: "workspace-1",
					projectId: "project-1",
					groupId: "group-1",
					tabOrder: 3,
					isHidden: true,
				},
			],
		});
	});
});
