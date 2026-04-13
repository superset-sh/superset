import { toast } from "@superset/ui/sonner";
import { useMatchRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { apiTrpcClient } from "renderer/lib/api-trpc-client";
import { getDeleteFocusTargetWorkspaceId } from "renderer/routes/_authenticated/_dashboard/components/DashboardSidebar/utils/getDeleteFocusTargetWorkspaceId";
import { getFlattenedV2WorkspaceIds } from "renderer/routes/_authenticated/_dashboard/components/DashboardSidebar/utils/getFlattenedV2WorkspaceIds";
import { navigateToV2Workspace } from "renderer/routes/_authenticated/_dashboard/utils/workspace-navigation";
import { useDashboardSidebarState } from "renderer/routes/_authenticated/hooks/useDashboardSidebarState";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";

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
	const collections = useCollections();
	const { createSection, moveWorkspaceToSection, removeWorkspaceFromSidebar } =
		useDashboardSidebarState();

	const [isRenaming, setIsRenaming] = useState(false);
	const [renameValue, setRenameValue] = useState(workspaceName);
	const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);

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

	const handleDelete = () => {
		const focusTargetId = isActive
			? getDeleteFocusTargetWorkspaceId(
					getFlattenedV2WorkspaceIds(collections),
					workspaceId,
				)
			: null;

		setIsDeleteDialogOpen(false);

		const deletePromise = (async () => {
			await apiTrpcClient.v2Workspace.delete.mutate({ id: workspaceId });
			removeWorkspaceFromSidebar(workspaceId);
		})();

		toast.promise(deletePromise, {
			loading: "Deleting workspace...",
			success: "Workspace deleted",
			error: (error) =>
				`Failed to delete: ${error instanceof Error ? error.message : "Unknown error"}`,
		});

		void deletePromise.then(() => {
			if (!isActive) return;
			if (focusTargetId) {
				void navigateToV2Workspace(focusTargetId, navigate);
			} else {
				void navigate({ to: "/" });
			}
		});
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
