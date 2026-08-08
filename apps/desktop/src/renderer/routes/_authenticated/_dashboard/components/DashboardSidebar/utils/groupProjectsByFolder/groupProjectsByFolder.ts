import type {
	DashboardSidebarFolder,
	DashboardSidebarProject,
} from "../../types";

export interface FolderWithProjects {
	folder: DashboardSidebarFolder;
	projects: DashboardSidebarProject[];
}

export interface GroupedProjects {
	foldersWithProjects: FolderWithProjects[];
	ungroupedProjects: DashboardSidebarProject[];
}

/**
 * Split an ordered project list into per-folder lists plus the ungrouped root
 * list, preserving the incoming project order within each bucket. A project
 * pointing at a deleted folder falls back to the root so it can never become
 * unreachable.
 */
export function groupProjectsByFolder(
	folders: DashboardSidebarFolder[],
	projects: DashboardSidebarProject[],
): GroupedProjects {
	const folderIds = new Set(folders.map((folder) => folder.id));
	const byFolder = new Map<string, DashboardSidebarProject[]>();
	const ungroupedProjects: DashboardSidebarProject[] = [];

	for (const project of projects) {
		if (project.folderId && folderIds.has(project.folderId)) {
			const list = byFolder.get(project.folderId);
			if (list) list.push(project);
			else byFolder.set(project.folderId, [project]);
		} else {
			ungroupedProjects.push(project);
		}
	}

	return {
		foldersWithProjects: folders.map((folder) => ({
			folder,
			projects: byFolder.get(folder.id) ?? [],
		})),
		ungroupedProjects,
	};
}
