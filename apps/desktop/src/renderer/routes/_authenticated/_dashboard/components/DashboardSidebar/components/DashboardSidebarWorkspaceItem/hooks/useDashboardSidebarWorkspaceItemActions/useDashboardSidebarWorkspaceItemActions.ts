import { toast } from "@superset/ui/sonner";
import { useQueryClient } from "@tanstack/react-query";
import { useMatchRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import {
	useMarkWorkspaceTerminalsSeen,
	useV2WorkspaceIsUnread,
} from "renderer/hooks/host-service/useV2NotificationStatus";
import { useWorkspaceHostUrl } from "renderer/hooks/host-service/useWorkspaceHostUrl";
import { useCopyToClipboard } from "renderer/hooks/useCopyToClipboard";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { showHostServiceUnavailableToast } from "renderer/lib/host-service-unavailable";
import { electronTrpcClient } from "renderer/lib/trpc-client";
import { useDashboardSidebarSectionRename } from "renderer/routes/_authenticated/_dashboard/components/DashboardSidebar/components/DashboardSidebarSectionRenameContext";
import { DASHBOARD_SIDEBAR_PULL_REQUEST_QUERY_KEY_PREFIX } from "renderer/routes/_authenticated/_dashboard/components/DashboardSidebar/hooks/useDashboardSidebarData/derivePullRequestQueryTargets";
import { useDashboardSidebarState } from "renderer/routes/_authenticated/hooks/useDashboardSidebarState";
import { useOptimisticCollectionActions } from "renderer/routes/_authenticated/hooks/useOptimisticCollectionActions";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";
import { useRemoveFromSidebarIntent } from "renderer/stores/remove-workspace-from-sidebar-intent";
import { useV2NotificationStore } from "renderer/stores/v2-notifications";

interface UseDashboardSidebarWorkspaceItemActionsOptions {
	workspaceId: string;
	projectId: string;
	workspaceName: string;
	branch: string;
	isMainWorkspace?: boolean;
}

export function useDashboardSidebarWorkspaceItemActions({
	workspaceId,
	projectId,
	workspaceName,
	branch,
	isMainWorkspace = false,
}: UseDashboardSidebarWorkspaceItemActionsOptions) {
	const navigate = useNavigate();
	const matchRoute = useMatchRoute();
	const hostService = useLocalHostService();
	const { activeHostUrl } = hostService;
	const { copyToClipboard } = useCopyToClipboard();
	const { v2Workspaces: workspaceActions } = useOptimisticCollectionActions();
	const { requestSectionRename } = useDashboardSidebarSectionRename();
	const setManualUnread = useV2NotificationStore((s) => s.setManualUnread);
	const clearManualUnread = useV2NotificationStore((s) => s.clearManualUnread);
	const markWorkspaceTerminalsSeen = useMarkWorkspaceTerminalsSeen(workspaceId);
	const isUnread = useV2WorkspaceIsUnread(workspaceId);
	const workspaceHostUrl = useWorkspaceHostUrl(workspaceId);
	const queryClient = useQueryClient();

	const clearWorkspaceAttention = () => {
		clearManualUnread(workspaceId);
		markWorkspaceTerminalsSeen();
	};
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
		clearWorkspaceAttention();
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
		useRemoveFromSidebarIntent.getState().request({
			workspaceId,
			workspaceName,
			projectId,
			isMain: isMainWorkspace,
		});
	};

	const handleCreateSection = () => {
		const sectionId = createSection(projectId);
		moveWorkspaceToSection(workspaceId, projectId, sectionId);
		requestSectionRename(sectionId);
	};

	const resolveWorktreePath = async (): Promise<string | null> => {
		if (!activeHostUrl) {
			showHostServiceUnavailableToast(hostService, {
				action: "resolve the workspace path",
			});
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
			clearWorkspaceAttention();
		} else {
			setManualUnread(workspaceId);
		}
	};

	// Clears manual + review marks locally, then forces the host's bindings
	// to Stop — the escape hatch for a wedged working/permission dot (an
	// interrupted agent fires no Stop hook). Live agents re-assert on their
	// next hook event, so this is safe to run on a genuinely busy workspace.
	const handleClearStatus = async () => {
		clearWorkspaceAttention();
		if (!workspaceHostUrl) return;
		try {
			await getHostServiceClientByUrl(
				workspaceHostUrl,
			).terminalAgents.clearWorkspaceStatuses.mutate({ workspaceId });
			await queryClient.invalidateQueries({
				queryKey: ["terminal-agent-bindings", workspaceHostUrl, workspaceId],
			});
		} catch (error) {
			toast.error(
				`Failed to clear agent status: ${error instanceof Error ? error.message : "Unknown error"}`,
			);
		}
	};

	const handleRemovePullRequest = async () => {
		if (!workspaceHostUrl) return;
		try {
			await getHostServiceClientByUrl(
				workspaceHostUrl,
			).pullRequests.unlinkFromWorkspace.mutate({ workspaceId });
			await queryClient.invalidateQueries({
				queryKey: DASHBOARD_SIDEBAR_PULL_REQUEST_QUERY_KEY_PREFIX,
			});
		} catch (error) {
			toast.error(
				`Failed to remove PR link: ${error instanceof Error ? error.message : "Unknown error"}`,
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
		handleClearStatus,
		handleClick,
		handleCopyPath,
		handleCopyBranchName,
		handleCreateSection,
		handleDeleted,
		handleOpenInFinder,
		handleRemoveFromSidebar,
		handleRemovePullRequest,
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
