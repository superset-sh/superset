import { createContext, type ReactNode, useContext } from "react";
import type { DashboardSidebarFolder } from "../../types";

interface DashboardSidebarFolderContextValue {
	folders: DashboardSidebarFolder[];
	/** Move a project into a folder, or back to the root when null. */
	moveProjectToFolder: (projectId: string, folderId: string | null) => void;
	/** Create a folder and move the project straight into it. */
	createFolderForProject: (projectId: string) => void;
	/** Create a folder and move every given project into it (bulk select). */
	createFolderForProjects: (projectIds: string[]) => void;
}

const DashboardSidebarFolderContext =
	createContext<DashboardSidebarFolderContextValue | null>(null);

/**
 * Supplies the folder list and folder actions to rows deep in the sidebar
 * (e.g. a project's context menu) without threading props through every level.
 * Mirrors DashboardSidebarSectionRenameContext.
 */
export function DashboardSidebarFolderProvider({
	value,
	children,
}: {
	value: DashboardSidebarFolderContextValue;
	children: ReactNode;
}) {
	return (
		<DashboardSidebarFolderContext.Provider value={value}>
			{children}
		</DashboardSidebarFolderContext.Provider>
	);
}

/**
 * Returns folder state/actions, or a no-op fallback when rendered outside the
 * provider (e.g. the drag overlay), so consumers never need a null check.
 */
export function useDashboardSidebarFolders(): DashboardSidebarFolderContextValue {
	return (
		useContext(DashboardSidebarFolderContext) ?? {
			folders: [],
			moveProjectToFolder: () => {},
			createFolderForProject: () => {},
			createFolderForProjects: () => {},
		}
	);
}
