import { toast } from "@superset/ui/sonner";
import { useMatchRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { apiTrpcClient } from "renderer/lib/api-trpc-client";
import { useDashboardSidebarState } from "renderer/routes/_authenticated/hooks/useDashboardSidebarState";

interface UseDashboardSidebarWorkspaceItemActionsOptions {
	workspaceId: string;
	projectId: string;
	workspaceName: string;
}

export function useDashboardSidebarWorkspaceItemActions({
	workspaceId,
	projectId,
	workspaceName,
}: UseDashboardSidebarWorkspaceItemActionsOptions) {
	const navigate = useNavigate();
	const matchRoute = useMatchRoute();
	const { createSection, moveWorkspaceToSection, removeWorkspaceFromSidebar } =
		useDashboardSidebarState();

	const [isRenaming, setIsRenaming] = useState(false);
	const [renameValue, setRenameValue] = useState(workspaceName);
	const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
	const [isDeleting, setIsDeleting] = useState(false);

	const isActive = !!matchRoute({
		to: "/v2-workspace/$workspaceId",
		params: { workspaceId },
		fuzzy: true,
	});

	const handleClick = () => {
		if (isRenaming) return;
		navigate({
			to: "/v2-workspace/$workspaceId",
			params: { workspaceId },
		});
	};

	const startRename = () => {
		setRenameValue(workspaceName);
		setIsRenaming(true);
	};

	const cancelRename = () => {
		setIsRenaming(false);
		setRenameValue(workspaceName);
	};

	const submitRename = async () => {
		setIsRenaming(false);
		const trimmed = renameValue.trim();
		if (!trimmed || trimmed === workspaceName) return;
		try {
			await apiTrpcClient.v2Workspace.update.mutate({
				id: workspaceId,
				name: trimmed,
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
			await apiTrpcClient.v2Workspace.delete.mutate({ id: workspaceId });
			removeWorkspaceFromSidebar(workspaceId);
			setIsDeleteDialogOpen(false);
			toast.success("Workspace deleted");
			if (isActive) {
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

	const handleCreateSection = () => {
		const newSectionId = createSection(projectId);
		moveWorkspaceToSection(workspaceId, projectId, newSectionId);
	};

	const handleOpenInFinder = () => {
		toast.info("Open in Finder is coming soon");
	};

	const handleCopyPath = () => {
		toast.info("Copy Path is coming soon");
	};

	return {
		cancelRename,
		handleClick,
		handleCopyPath,
		handleCreateSection,
		handleDelete,
		handleOpenInFinder,
		isActive,
		isDeleteDialogOpen,
		isDeleting,
		isRenaming,
		moveWorkspaceToSection,
		removeWorkspaceFromSidebar,
		renameValue,
		setIsDeleteDialogOpen,
		setRenameValue,
		startRename,
		submitRename,
	};
}
