import {
	projectCollectionId,
	resolveProjectCollections,
} from "@superset/shared/project-collections";
import {
	getWorkspaceActivityTime,
	toTime,
} from "@superset/shared/workspace-activity";
import { PROJECTS_TAG_SCOPE } from "@superset/shared/workspace-tags";
import {
	type HostTagFoldersResult,
	mergeHostTagFolders,
} from "renderer/hooks/host-projects/useHostTagFolders/useHostTagFolders.utils";
import type {
	DashboardSidebarProjectRow,
	DashboardSidebarSectionRow,
	SidebarProjectSortMode,
} from "renderer/routes/_authenticated/providers/CollectionsProvider/dashboardSidebarLocal/schema";

export interface CollectionProject {
	id: string;
	name: string;
	tags?: readonly string[];
}

export interface CollectionWorkspace {
	projectId: string | null;
	createdAt: Date | number | string;
	updatedAt: Date | number | string;
	lastActivityAt: number | null;
}

export interface ProjectCollection<Project> {
	id: string;
	tag: string;
	name: string;
	color: string | null;
	tabOrder: number;
	isCollapsed: boolean;
	projects: Project[];
}

export type ProjectCollectionRootItem<Project> =
	| { type: "project"; project: Project; tabOrder: number }
	| {
			type: "collection";
			collection: ProjectCollection<Project>;
			tabOrder: number;
	  };

export { projectCollectionId } from "@superset/shared/project-collections";

export function deriveProjectCollections<Project extends CollectionProject>({
	projects,
	hostResults,
	placements = [],
	projectPlacements = [],
	workspaces = [],
	sortMode = "manual",
	hideEmpty = false,
	filter = "",
}: {
	projects: readonly Project[];
	hostResults: HostTagFoldersResult[];
	placements?: readonly DashboardSidebarSectionRow[];
	projectPlacements?: readonly Pick<
		DashboardSidebarProjectRow,
		"projectId" | "tabOrder" | "isHidden"
	>[];
	workspaces?: readonly CollectionWorkspace[];
	sortMode?: SidebarProjectSortMode;
	hideEmpty?: boolean;
	filter?: string;
}): {
	collections: ProjectCollection<Project>[];
	rootItems: ProjectCollectionRootItem<Project>[];
	collectionByProjectId: Map<string, ProjectCollection<Project>>;
} {
	const settings = mergeHostTagFolders(hostResults).filter(
		(row) => row.scope === PROJECTS_TAG_SCOPE,
	);
	const localByTag = new Map(
		placements
			.filter((row) => row.projectId === PROJECTS_TAG_SCOPE && row.tag != null)
			.map((row) => [row.tag, row]),
	);
	const projectPlacementById = new Map(
		projectPlacements.map((row) => [row.projectId, row]),
	);
	const resolved = resolveProjectCollections({
		projects,
		settings,
		tabOrderOverride: (tag) => localByTag.get(tag)?.tabOrder,
	});
	const collections: ProjectCollection<Project>[] = resolved.collections.map(
		(summary) => ({
			id: projectCollectionId(summary.tag),
			...summary,
			isCollapsed: localByTag.get(summary.tag)?.isCollapsed ?? false,
			projects: [],
		}),
	);
	const collectionByTag = new Map(
		collections.map((collection) => [collection.tag, collection]),
	);
	const collectionByProjectId = new Map<string, ProjectCollection<Project>>();
	const rootItems: ProjectCollectionRootItem<Project>[] = [];
	const query = filter.trim().toLowerCase();
	for (const project of projects) {
		const tag = resolved.collectionByProjectId.get(project.id)?.tag;
		const collection = tag ? collectionByTag.get(tag) : undefined;
		if (collection) collectionByProjectId.set(project.id, collection);
		if (projectPlacementById.get(project.id)?.isHidden) continue;
		if (
			query &&
			!project.name.toLowerCase().includes(query) &&
			!collection?.name.toLowerCase().includes(query)
		)
			continue;
		if (collection) collection.projects.push(project);
		else
			rootItems.push({
				type: "project",
				project,
				tabOrder: projectPlacementById.get(project.id)?.tabOrder ?? 0,
			});
	}
	const manualOrder = (project: Project) =>
		projectPlacementById.get(project.id)?.tabOrder ?? 0;
	const timestamps = new Map<string, number>();
	for (const workspace of workspaces) {
		if (workspace.projectId === null) continue;
		const time =
			sortMode === "created"
				? toTime(workspace.createdAt)
				: getWorkspaceActivityTime(workspace);
		if (Number.isFinite(time))
			timestamps.set(
				workspace.projectId,
				Math.max(
					timestamps.get(workspace.projectId) ?? Number.NEGATIVE_INFINITY,
					time,
				),
			);
	}
	for (const collection of collections) {
		collection.projects.sort((a, b) => {
			if (sortMode !== "manual") {
				const diff =
					(timestamps.get(b.id) ?? Number.NEGATIVE_INFINITY) -
					(timestamps.get(a.id) ?? Number.NEGATIVE_INFINITY);
				if (!Number.isNaN(diff) && diff !== 0) return diff;
				return a.name.localeCompare(b.name) || a.id.localeCompare(b.id);
			}
			return manualOrder(a) - manualOrder(b) || a.id.localeCompare(b.id);
		});
		if (
			(hideEmpty && collection.projects.length === 0) ||
			(query &&
				collection.projects.length === 0 &&
				!collection.name.toLowerCase().includes(query))
		)
			continue;
		rootItems.push({
			type: "collection",
			collection: query ? { ...collection, isCollapsed: false } : collection,
			tabOrder: collection.tabOrder,
		});
	}
	rootItems.sort(
		(a, b) =>
			a.tabOrder - b.tabOrder ||
			(a.type === "project" ? a.project.id : a.collection.id).localeCompare(
				b.type === "project" ? b.project.id : b.collection.id,
			),
	);
	return { collections, rootItems, collectionByProjectId };
}
