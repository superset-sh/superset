import { useDashboardSidebarSectionRename } from "renderer/routes/_authenticated/_dashboard/components/DashboardSidebar/components/DashboardSidebarSectionRenameContext";
import { useProjectSidebarSections } from "../../../../../../hooks/useProjectSidebarSections";
import { useProjectSidebarSectionOptions } from "../../../../../../providers/ProjectSidebarSectionsProvider";

/** The Projects-list sections a project can move to, and the moves. */
export function useProjectSectionMenu({
	projectId,
	renameNewSection,
}: {
	projectId: string;
	/** False where the new section's header isn't shown to rename in. */
	renameNewSection: boolean;
}) {
	const sections = useProjectSidebarSectionOptions();
	const { createProjectSection, moveProjectToSection } =
		useProjectSidebarSections();
	const { requestSectionRename } = useDashboardSidebarSectionRename();

	return {
		sections,
		moveToSection: (sectionId: string | null) =>
			moveProjectToSection(projectId, sectionId),
		moveToNewSection: () => {
			const sectionId = createProjectSection({ fromProjectId: projectId });
			if (renameNewSection) requestSectionRename(sectionId);
		},
	};
}
