import { toast } from "@superset/ui/sonner";
import { useMatchRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { env } from "renderer/env.renderer";
import { useCopyToClipboard } from "renderer/hooks/useCopyToClipboard";
import { apiTrpcClient } from "renderer/lib/api-trpc-client";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { electronTrpcClient } from "renderer/lib/trpc-client";
import { useNavigateAwayFromWorkspace } from "renderer/routes/_authenticated/_dashboard/components/DashboardSidebar/hooks/useNavigateAwayFromWorkspace";
import { useDashboardSidebarState } from "renderer/routes/_authenticated/hooks/useDashboardSidebarState";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";
import type { DashboardSidebarWorkspaceHostType } from "../../../../types";

interface UseDashboardSidebarWorkspaceItemActionsOptions {
	workspaceId: string;
	projectId: string;
	workspaceName: string;
	branch: string;
	hostId: string;
	hostType: DashboardSidebarWorkspaceHostType;
	hostIsOnline: boolean | null;
}

export function useDashboardSidebarWorkspaceItemActions({
	workspaceId,
	projectId,
	workspaceName,
	branch,
	hostId,
	hostType,
	hostIsOnline,
}: UseDashboardSidebarWorkspaceItemActionsOptions) {
	const navigate = useNavigate();
	const matchRoute = useMatchRoute();
	const navigateAway = useNavigateAwayFromWorkspace();
	const { activeHostUrl } = useLocalHostService();
	const { copyToClipboard } = useCopyToClipboard();
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
			const hostUrl =
				hostType === "local-device"
					? activeHostUrl
					: hostType === "remote-device" && hostIsOnline
						? `${env.RELAY_URL}/hosts/${hostId}`
						: null;
			if (hostUrl) {
				try {
					await getHostServiceClientByUrl(
						hostUrl,
					).workspace.refreshNameArtifacts.mutate({ id: workspaceId });
				} catch (error) {
					console.warn("[workspace rename] failed to refresh name artifacts", {
						workspaceId,
						error,
					});
				}
			}
		} catch (error) {
			toast.error(
				`Failed to rename: ${error instanceof Error ? error.message : "Unknown error"}`,
			);
		}
	};

	const handleDeleted = () => {
		removeWorkspaceFromSidebar(workspaceId);
	};

	const handleRemoveFromSidebar = () => {
		navigateAway(workspaceId);
		removeWorkspaceFromSidebar(workspaceId);
	};

	const handleCreateSection = () => {
		createSection(projectId, {
			insertAfterWorkspaceId: workspaceId,
		});
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
		isActive,
		isDeleteDialogOpen,
		isRenaming,
		moveWorkspaceToSection,
		renameValue,
		setIsDeleteDialogOpen,
		setRenameValue,
		startRename,
		submitRename,
	};
}
