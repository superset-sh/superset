import { createContext, type ReactNode, useContext, useMemo } from "react";
import type { ProjectSectionInput } from "../../utils/projectSidebarLane";

export interface ProjectSidebarSectionOption {
	id: string;
	name: string;
	color: string | null;
}

const ProjectSidebarSectionsContext = createContext<
	ProjectSidebarSectionOption[] | null
>(null);

interface ProjectSidebarSectionsProviderProps {
	sections: readonly ProjectSectionInput[];
	children: ReactNode;
}

/** Every Projects-list section in list order, for the move-to menus. */
export function ProjectSidebarSectionsProvider({
	sections,
	children,
}: ProjectSidebarSectionsProviderProps) {
	const options = useMemo(
		() =>
			[...sections]
				.sort(
					(left, right) =>
						left.tabOrder - right.tabOrder ||
						left.sectionId.localeCompare(right.sectionId),
				)
				.map((section) => ({
					id: section.sectionId,
					name: section.name,
					color: section.color,
				})),
		[sections],
	);
	return (
		<ProjectSidebarSectionsContext.Provider value={options}>
			{children}
		</ProjectSidebarSectionsContext.Provider>
	);
}

export function useProjectSidebarSectionOptions() {
	const context = useContext(ProjectSidebarSectionsContext);
	if (!context) {
		throw new Error(
			"useProjectSidebarSectionOptions must be used within ProjectSidebarSectionsProvider",
		);
	}
	return context;
}
