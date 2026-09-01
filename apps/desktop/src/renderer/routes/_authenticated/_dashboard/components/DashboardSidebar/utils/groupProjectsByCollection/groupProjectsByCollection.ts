import type {
	DashboardSidebarCollection,
	DashboardSidebarProject,
} from "../../types";

export interface CollectionWithProjects {
	collection: DashboardSidebarCollection;
	projects: DashboardSidebarProject[];
}

export interface GroupedProjects {
	collectionsWithProjects: CollectionWithProjects[];
	ungroupedProjects: DashboardSidebarProject[];
}

/**
 * Split an ordered project list into per-collection lists plus the ungrouped root
 * list, preserving the incoming project order within each bucket. A project
 * pointing at a deleted collection falls back to the root so it can never become
 * unreachable.
 */
export function groupProjectsByCollection(
	collections: DashboardSidebarCollection[],
	projects: DashboardSidebarProject[],
): GroupedProjects {
	const collectionIds = new Set(collections.map((collection) => collection.id));
	const byCollection = new Map<string, DashboardSidebarProject[]>();
	const ungroupedProjects: DashboardSidebarProject[] = [];

	for (const project of projects) {
		if (project.collectionId && collectionIds.has(project.collectionId)) {
			const list = byCollection.get(project.collectionId);
			if (list) list.push(project);
			else byCollection.set(project.collectionId, [project]);
		} else {
			ungroupedProjects.push(project);
		}
	}

	return {
		collectionsWithProjects: collections.map((collection) => ({
			collection,
			projects: byCollection.get(collection.id) ?? [],
		})),
		ungroupedProjects,
	};
}
