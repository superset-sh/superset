import { alert } from "@superset/ui/atoms/Alert";
import { toast } from "@superset/ui/sonner";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useDashboardSidebarState } from "renderer/routes/_authenticated/hooks/useDashboardSidebarState";
import { useOptimisticCollectionActions } from "renderer/routes/_authenticated/hooks/useOptimisticCollectionActions";
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
	const { v2Projects: projectActions } = useOptimisticCollectionActions();
	const {
		createSection,
		deleteSection,
		removeProjectFromSidebar,
		renameSection,
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
		projectActions.renameProject(project.id, trimmed);
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
		createSection(project.id);
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
