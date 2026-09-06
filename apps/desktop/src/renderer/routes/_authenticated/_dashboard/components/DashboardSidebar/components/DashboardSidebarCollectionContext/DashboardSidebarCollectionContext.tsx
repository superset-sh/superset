import { createContext, type ReactNode, useContext } from "react";
import type { DashboardSidebarCollection } from "../../types";

interface DashboardSidebarCollectionContextValue {
	collections: DashboardSidebarCollection[];
	/** Move a project into a collection, or back to the root when null. */
	moveProjectToCollection: (
		projectId: string,
		collectionId: string | null,
	) => void;
	/** Create a collection and move the project straight into it. */
	createCollectionForProject: (projectId: string) => void;
	/** Create a collection and move every given project into it (bulk select). */
	createCollectionForProjects: (projectIds: string[]) => void;
}

const DashboardSidebarCollectionContext =
	createContext<DashboardSidebarCollectionContextValue | null>(null);

/**
 * Supplies the collection list and collection actions to rows deep in the sidebar
 * (e.g. a project's context menu) without threading props through every level.
 * Mirrors DashboardSidebarSectionRenameContext.
 */
export function DashboardSidebarCollectionProvider({
	value,
	children,
}: {
	value: DashboardSidebarCollectionContextValue;
	children: ReactNode;
}) {
	return (
		<DashboardSidebarCollectionContext.Provider value={value}>
			{children}
		</DashboardSidebarCollectionContext.Provider>
	);
}

/**
 * Returns collection state/actions, or a no-op fallback when rendered outside the
 * provider (e.g. the drag overlay), so consumers never need a null check.
 */
export function useDashboardSidebarCollections(): DashboardSidebarCollectionContextValue {
	return (
		useContext(DashboardSidebarCollectionContext) ?? {
			collections: [],
			moveProjectToCollection: () => {},
			createCollectionForProject: () => {},
			createCollectionForProjects: () => {},
		}
	);
}
