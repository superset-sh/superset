import { toast } from "@superset/ui/sonner";
import { useMatchRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useCopyToClipboard } from "renderer/hooks/useCopyToClipboard";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { electronTrpcClient } from "renderer/lib/trpc-client";
import { useDashboardSidebarSectionRename } from "renderer/routes/_authenticated/_dashboard/components/DashboardSidebar/components/DashboardSidebarSectionRenameContext";
import { useNavigateAwayFromWorkspace } from "renderer/routes/_authenticated/_dashboard/components/DashboardSidebar/hooks/useNavigateAwayFromWorkspace";
import { useDashboardSidebarState } from "renderer/routes/_authenticated/hooks/useDashboardSidebarState";
import { useOptimisticCollectionActions } from "renderer/routes/_authenticated/hooks/useOptimisticCollectionActions";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";
import {
	useV2NotificationStore,
	useV2WorkspaceIsUnread,
} from "renderer/stores/v2-notifications";

interface UseDashboardSidebarWorkspaceItemActionsOptions {
	workspaceId: string;
	projectId: string;
	workspaceName: string;
	branch: string;
}

export function useDashboardSidebarWorkspaceItemActions({
	workspaceId,
	projectId,
	workspaceName,
	branch,
}: UseDashboardSidebarWorkspaceItemActionsOptions) {
	const navigate = useNavigate();
	const matchRoute = useMatchRoute();
	const navigateAway = useNavigateAwayFromWorkspace();
	const { activeHostUrl } = useLocalHostService();
	const { copyToClipboard } = useCopyToClipboard();
	const { v2Workspaces: workspaceActions } = useOptimisticCollectionActions();
	const { requestSectionRename } = useDashboardSidebarSectionRename();
	const clearWorkspaceAttention = useV2NotificationStore(
		(s) => s.clearWorkspaceAttention,
	);
	const setManualUnread = useV2NotificationStore((s) => s.setManualUnread);
	const isUnread = useV2WorkspaceIsUnread(workspaceId);
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
		clearWorkspaceAttention(workspaceId);
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

	const submitRename = () => {
		setIsRenaming(false);
		const trimmed = renameValue.trim();
		if (!trimmed || trimmed === workspaceName) return;
		workspaceActions.renameWorkspace(workspaceId, trimmed);
	};

	const handleDeleted = () => {
		removeWorkspaceFromSidebar(workspaceId);
	};

	const handleRemoveFromSidebar = () => {
		navigateAway(workspaceId);
		removeWorkspaceFromSidebar(workspaceId);
	};

	const handleCreateSection = () => {
		const sectionId = createSection(projectId);
		moveWorkspaceToSection(workspaceId, projectId, sectionId);
		requestSectionRename(sectionId);
	};

	const resolveWorktreePath = async (): Promise<string | null> => {
		if (!activeHostUrl) {
			toast.error("Host service is not available");
			return null;
		}
		const workspace = await getHostServiceClientByUrl(
			activeHostUrl,
		).workspace.get.query({ id: workspaceId });
		if (!workspace?.worktreePath) {
			toast.error("Workspace path is not available");
			return null;
		}
		return workspace.worktreePath;
	};

	const handleOpenInFinder = async () => {
		try {
			const path = await resolveWorktreePath();
			if (!path) return;
			await electronTrpcClient.external.openInFinder.mutate(path);
		} catch (error) {
			toast.error(
				`Failed to open in Finder: ${error instanceof Error ? error.message : "Unknown error"}`,
			);
		}
	};

	const handleCopyPath = async () => {
		try {
			const path = await resolveWorktreePath();
			if (!path) return;
			await copyToClipboard(path);
			toast.success("Path copied");
		} catch (error) {
			toast.error(
				`Failed to copy path: ${error instanceof Error ? error.message : "Unknown error"}`,
			);
		}
	};

	const handleToggleUnread = () => {
		if (isUnread) {
			clearWorkspaceAttention(workspaceId);
		} else {
			setManualUnread(workspaceId);
		}
	};

	const handleCopyBranchName = async () => {
		if (!branch) {
			toast.error("Branch name is not available");
			return;
		}
		try {
			await copyToClipboard(branch);
			toast.success("Branch name copied");
		} catch (error) {
			toast.error(
				`Failed to copy branch name: ${error instanceof Error ? error.message : "Unknown error"}`,
			);
		}
	};

	return {
		cancelRename,
		handleClick,
		handleCopyPath,
		handleCopyBranchName,
		handleCreateSection,
		handleDeleted,
		handleOpenInFinder,
		handleRemoveFromSidebar,
		handleToggleUnread,
		isActive,
		isDeleteDialogOpen,
		isRenaming,
		isUnread,
		moveWorkspaceToSection,
		renameValue,
		setIsDeleteDialogOpen,
		setRenameValue,
		startRename,
		submitRename,
	};
}
