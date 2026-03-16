import { toast } from "@superset/ui/sonner";
import { useMatchRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { apiTrpcClient } from "renderer/lib/api-trpc-client";
import { useDashboardSidebarState } from "renderer/routes/_authenticated/hooks/useDashboardSidebarState";
import { useOpenNewWorkspaceModal } from "renderer/stores/new-workspace-modal";
import type {
	DashboardSidebarSection,
	DashboardSidebarWorkspace,
} from "../../../../types";

interface UseDashboardSidebarProjectSectionActionsOptions {
	projectId: string;
	projectName: string;
	workspaces: DashboardSidebarWorkspace[];
	sections: DashboardSidebarSection[];
}

export function useDashboardSidebarProjectSectionActions({
	projectId,
	projectName,
	workspaces,
	sections,
}: UseDashboardSidebarProjectSectionActionsOptions) {
	const openModal = useOpenNewWorkspaceModal();
	const navigate = useNavigate();
	const matchRoute = useMatchRoute();
	const {
		createSection,
		deleteSection,
		removeProjectFromSidebar,
		renameSection,
		toggleSectionCollapsed,
	} = useDashboardSidebarState();

	const [isRenaming, setIsRenaming] = useState(false);
	const [renameValue, setRenameValue] = useState(projectName);
	const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
	const [isDeleting, setIsDeleting] = useState(false);

	const startRename = () => {
		setRenameValue(projectName);
		setIsRenaming(true);
	};

	const cancelRename = () => {
		setIsRenaming(false);
		setRenameValue(projectName);
	};

	const submitRename = async () => {
		setIsRenaming(false);
		const trimmed = renameValue.trim();
		if (!trimmed || trimmed === projectName) return;
		try {
			await apiTrpcClient.v2Project.update.mutate({
				id: projectId,
				name: trimmed,
				slug: trimmed.toLowerCase().replace(/\s+/g, "-"),
			});
		} catch (error) {
			toast.error(
				`Failed to rename: ${error instanceof Error ? error.message : "Unknown error"}`,
			);
		}
	};

	const handleDelete = async () => {
		setIsDeleting(true);
		try {
			await apiTrpcClient.v2Project.delete.mutate({ id: projectId });
			removeProjectFromSidebar(projectId);
			setIsDeleteDialogOpen(false);
			toast.success("Project deleted");

			const isInProject = [
				...workspaces,
				...sections.flatMap((s) => s.workspaces),
			].some(
				(workspace) =>
					!!matchRoute({
						to: "/v2-workspace/$workspaceId",
						params: { workspaceId: workspace.id },
						fuzzy: true,
					}),
			);
			if (isInProject) {
				navigate({ to: "/" });
			}
		} catch (error) {
			toast.error(
				`Failed to delete: ${error instanceof Error ? error.message : "Unknown error"}`,
			);
		} finally {
			setIsDeleting(false);
		}
	};

	const handleNewWorkspace = () => {
		openModal(projectId);
	};

	const handleNewSection = () => {
		createSection(projectId);
	};

	return {
		cancelRename,
		deleteSection,
		handleDelete,
		handleNewSection,
		handleNewWorkspace,
		isDeleteDialogOpen,
		isDeleting,
		isRenaming,
		removeProjectFromSidebar,
		renameSection,
		renameValue,
		setIsDeleteDialogOpen,
		setRenameValue,
		startRename,
		submitRename,
		toggleSectionCollapsed,
	};
}
