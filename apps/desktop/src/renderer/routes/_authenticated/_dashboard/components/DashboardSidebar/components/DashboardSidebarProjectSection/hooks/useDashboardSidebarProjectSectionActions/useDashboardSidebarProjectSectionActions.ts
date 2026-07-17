import { alert } from "@superset/ui/atoms/Alert";
import { toast } from "@superset/ui/sonner";
import { useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useHostProjects } from "renderer/hooks/host-projects/useHostProjects";
import { useHostUrl } from "renderer/hooks/host-service/useHostTargetUrl";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { useDashboardSidebarSectionRename } from "renderer/routes/_authenticated/_dashboard/components/DashboardSidebar/components/DashboardSidebarSectionRenameContext";
import { useDashboardSidebarState } from "renderer/routes/_authenticated/hooks/useDashboardSidebarState";
import { useOpenNewWorkspaceModal } from "renderer/stores/new-workspace-modal";
import type { DashboardSidebarProject } from "../../../../types";

interface UseDashboardSidebarProjectSectionActionsOptions {
	project: DashboardSidebarProject;
}

export function useDashboardSidebarProjectSectionActions({
	project,
}: UseDashboardSidebarProjectSectionActionsOptions) {
	const openModal = useOpenNewWorkspaceModal();
	const navigate = useNavigate();
	// Renames commit on a host serving the project — host.db owns the name.
	const { projects: hostProjects } = useHostProjects();
	const servingHostId = useMemo(
		() =>
			hostProjects.find((item) => item.projectKey === project.id)?.hostIds[0] ??
			null,
		[hostProjects, project.id],
	);
	// undefined (not null) when no host serves it — null would resolve to
	// the local host and rename the wrong replica.
	const servingHostUrl = useHostUrl(servingHostId ?? undefined);
	const { requestSectionRename } = useDashboardSidebarSectionRename();
	const {
		createSection,
		deleteSection,
		removeProjectFromSidebar,
		renameSection,
		toggleProjectCollapsed,
		toggleSectionCollapsed,
	} = useDashboardSidebarState();

	const [isRenaming, setIsRenaming] = useState(false);
	const [renameValue, setRenameValue] = useState(project.name);

	const startRename = () => {
		setRenameValue(project.name);
		setIsRenaming(true);
	};

	const cancelRename = () => {
		setIsRenaming(false);
		setRenameValue(project.name);
	};

	const submitRename = () => {
		setIsRenaming(false);
		const trimmed = renameValue.trim();
		if (!trimmed || trimmed === project.name) return;
		if (!servingHostUrl) {
			toast.error("Project's host is unreachable — cannot rename right now");
			return;
		}
		void getHostServiceClientByUrl(servingHostUrl)
			.project.update.mutate({ projectId: project.id, name: trimmed })
			.catch((err) => {
				toast.error(
					`Rename failed: ${err instanceof Error ? err.message : String(err)}`,
				);
			});
	};

	const handleOpenInFinder = () => {
		toast.info("Open in Finder is coming soon");
	};

	const handleOpenSettings = () => {
		navigate({
			to: "/settings/projects/$projectId",
			params: { projectId: project.id },
		});
	};

	const confirmRemoveFromSidebar = () => {
		alert({
			title: "Remove project from sidebar?",
			description:
				"This will remove workspaces from the sidebar and delete all project sections. The workspaces or projects won't be deleted.",
			actions: [
				{ label: "Cancel", variant: "outline", onClick: () => {} },
				{
					label: "Remove",
					variant: "destructive",
					onClick: () => removeProjectFromSidebar(project.id),
				},
			],
		});
	};

	const handleNewWorkspace = () => {
		openModal(project.id);
	};

	const handleNewSection = () => {
		const sectionId = createSection(project.id);
		requestSectionRename(sectionId);
		if (project.isCollapsed) {
			toggleProjectCollapsed(project.id);
		}
	};

	return {
		cancelRename,
		confirmRemoveFromSidebar,
		deleteSection,
		handleNewSection,
		handleNewWorkspace,
		handleOpenInFinder,
		handleOpenSettings,
		isRenaming,
		renameSection,
		renameValue,
		setRenameValue,
		startRename,
		submitRename,
		toggleSectionCollapsed,
	};
}
