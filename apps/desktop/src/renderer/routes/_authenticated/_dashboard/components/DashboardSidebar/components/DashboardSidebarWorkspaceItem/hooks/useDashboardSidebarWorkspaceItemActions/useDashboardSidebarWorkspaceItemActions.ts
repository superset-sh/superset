import { useLingui } from "@lingui/react/macro";
import { errorMessage } from "@superset/i18n/errors";
import {
	normalizeWorkspaceTags,
	SESSIONS_TAG_SCOPE,
} from "@superset/shared/workspace-tags";
import { toast } from "@superset/ui/sonner";
import { useQueryClient } from "@tanstack/react-query";
import { useMatchRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { getTerminalAgentBindingsQueryKey } from "renderer/hooks/host-service/useTerminalAgentBindings";
import { useWorkspaceHostUrl } from "renderer/hooks/host-service/useWorkspaceHostUrl";
import { useCopyToClipboard } from "renderer/hooks/useCopyToClipboard";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { showHostServiceUnavailableToast } from "renderer/lib/host-service-unavailable";
import { electronTrpcClient } from "renderer/lib/trpc-client";
import { useDashboardSidebarSectionRename } from "renderer/routes/_authenticated/_dashboard/components/DashboardSidebar/components/DashboardSidebarSectionRenameContext";
import { DASHBOARD_SIDEBAR_PULL_REQUEST_QUERY_KEY_PREFIX } from "renderer/routes/_authenticated/_dashboard/components/DashboardSidebar/hooks/useDashboardSidebarData/derivePullRequestQueryTargets";
import {
	useMarkSidebarWorkspaceTerminalsSeen,
	useSidebarWorkspaceStatus,
} from "renderer/routes/_authenticated/_dashboard/components/DashboardSidebar/providers/DashboardSidebarWorkspaceStatusProvider";
import { useDashboardSidebarState } from "renderer/routes/_authenticated/hooks/useDashboardSidebarState";
import { useOptimisticActions } from "renderer/routes/_authenticated/hooks/useOptimisticActions";
import { useHostWorkspaces } from "renderer/routes/_authenticated/providers/HostWorkspacesProvider";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";
import {
	applyFolderTagChange,
	buildSidebarFolderKey,
	mintFolderTag,
} from "renderer/routes/_authenticated/utils/workspaceTagFolders";
import { useDeleteWorkspaceIntent } from "renderer/stores/delete-workspace-intent";
import { useRemoveFromSidebarIntent } from "renderer/stores/remove-workspace-from-sidebar-intent";
import { useV2NotificationStore } from "renderer/stores/v2-notifications";

interface UseDashboardSidebarWorkspaceItemActionsOptions {
	workspaceId: string;
	/** Null for project-less "session" workspaces. */
	projectId: string | null;
	/**
	 * Cloud rows are also project-less, so a null `projectId` alone does not
	 * mean "session". Only sessions may be grouped by tag.
	 */
	isSessionWorkspace?: boolean;
	workspaceName: string;
	branch: string;
	/** The chip currently shown, so "Remove PR link" knows which PR to hide. */
	pullRequestUrl?: string | null;
	/** Cloud rows source their chip from the cloud table, not their host. */
	isCloudWorkspace?: boolean;
	isMainWorkspace?: boolean;
	isPinned?: boolean;
}

export function useDashboardSidebarWorkspaceItemActions({
	workspaceId,
	projectId,
	isSessionWorkspace = false,
	workspaceName,
	branch,
	pullRequestUrl = null,
	isCloudWorkspace = false,
	isMainWorkspace = false,
	isPinned = false,
}: UseDashboardSidebarWorkspaceItemActionsOptions) {
	const { t } = useLingui();
	const navigate = useNavigate();
	const matchRoute = useMatchRoute();
	const hostService = useLocalHostService();
	const { activeHostUrl } = hostService;
	const { copyToClipboard } = useCopyToClipboard();
	const { v2Workspaces: workspaceActions } = useOptimisticActions();
	const { requestSectionRename } = useDashboardSidebarSectionRename();
	const setManualUnread = useV2NotificationStore((s) => s.setManualUnread);
	const clearManualUnread = useV2NotificationStore((s) => s.clearManualUnread);
	const markWorkspaceTerminalsSeen =
		useMarkSidebarWorkspaceTerminalsSeen(workspaceId);
	const { isUnread } = useSidebarWorkspaceStatus(workspaceId);
	const workspaceHostUrl = useWorkspaceHostUrl(workspaceId);
	const queryClient = useQueryClient();
	const { workspaces: hostWorkspaces } = useHostWorkspaces();
	const sessionGroupTags = new Set(
		hostWorkspaces.flatMap((workspace) =>
			workspace.projectId === null
				? normalizeWorkspaceTags(workspace.tags)
				: [],
		),
	);
	const currentWorkspaceTags = normalizeWorkspaceTags(
		hostWorkspaces.find((workspace) => workspace.id === workspaceId)?.tags,
	);

	const clearWorkspaceAttention = () => {
		clearManualUnread(workspaceId);
		markWorkspaceTerminalsSeen();
	};
	const {
		createSection,
		moveWorkspaceToSection,
		setWorkspacePinned,
		setWorkspaceSuppressedPullRequest,
	} = useDashboardSidebarState();

	const [isRenaming, setIsRenaming] = useState(false);
	const [renameValue, setRenameValue] = useState(workspaceName);
	/**
	 * The submitted name, held until the store catches up.
	 *
	 * Closing the editor is a React state update while the optimistic cache
	 * patch reaches this row through react-query's notifier, which flushes on
	 * a microtask — so the row renders once with the pre-rename prop in
	 * between, and the old name flashes for a frame.
	 */
	const [pendingName, setPendingName] = useState<string | null>(null);
	if (pendingName !== null && pendingName === workspaceName) {
		setPendingName(null);
	}

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
		setPendingName(trimmed);
		workspaceActions.renameWorkspace(workspaceId, trimmed);
	};

	// The delete dialog is globally mounted (archive-first tombstoning drops
	// this row the moment the destroy starts, which would unmount a
	// row-local dialog mid-flight).
	const requestDelete = () => {
		useDeleteWorkspaceIntent.getState().request({
			workspaceId,
			workspaceName: workspaceName || branch,
		});
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
		if (projectId === null) {
			if (!isSessionWorkspace) return;
			const tag = mintFolderTag("New group", sessionGroupTags);
			void workspaceActions.updateWorkspace(workspaceId, {
				tags: applyFolderTagChange(currentWorkspaceTags, sessionGroupTags, tag),
			});
			requestSectionRename(buildSidebarFolderKey(SESSIONS_TAG_SCOPE, tag));
			return;
		}
		const sectionId = createSection(projectId);
		moveWorkspaceToSection(workspaceId, projectId, sectionId);
		requestSectionRename(sectionId);
	};

	const handleMoveToSection = (sectionId: string | null) => {
		if (projectId !== null) {
			moveWorkspaceToSection(workspaceId, projectId, sectionId);
			return;
		}
		if (!isSessionWorkspace) return;
		void workspaceActions.updateWorkspace(workspaceId, {
			tags: applyFolderTagChange(
				currentWorkspaceTags,
				sessionGroupTags,
				sectionId,
			),
		});
	};

	const resolveWorktreePath = async (): Promise<string | null> => {
		if (!activeHostUrl) {
			showHostServiceUnavailableToast(hostService, {
				action: "resolveWorkspacePath",
			});
			return null;
		}
		const workspace = await getHostServiceClientByUrl(
			activeHostUrl,
		).workspace.get.query({ id: workspaceId });
		if (!workspace?.worktreePath) {
			toast.error(
				t({
					message: "Workspace path is not available",
				}),
			);
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
				t({
					message: `Failed to open in Finder: ${errorMessage(error, "Unknown error")}`,
				}),
			);
		}
	};

	const handleCopyPath = async () => {
		try {
			const path = await resolveWorktreePath();
			if (!path) return;
			await copyToClipboard(path);
			toast.success(
				t({
					message: "Path copied",
				}),
			);
		} catch (error) {
			toast.error(
				t({
					message: `Failed to copy path: ${errorMessage(error, "Unknown error")}`,
				}),
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

	const handleTogglePin = () => {
		setWorkspacePinned(workspaceId, projectId, !isPinned);
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
				queryKey: getTerminalAgentBindingsQueryKey(workspaceId),
			});
		} catch (error) {
			toast.error(
				t({
					message: `Failed to clear agent status: ${errorMessage(error, "Unknown error")}`,
				}),
			);
		}
	};

	const handleRemovePullRequest = async () => {
		// A cloud row's chip is local state; its sandbox is told too when open.
		if (isCloudWorkspace && pullRequestUrl) {
			setWorkspaceSuppressedPullRequest(workspaceId, projectId, pullRequestUrl);
		}
		if (!workspaceHostUrl) {
			if (!isCloudWorkspace) {
				showHostServiceUnavailableToast(hostService, {
					action: "removePrLink",
				});
			}
			return;
		}
		try {
			await getHostServiceClientByUrl(
				workspaceHostUrl,
			).pullRequests.unlinkFromWorkspace.mutate({ workspaceId });
			await queryClient.invalidateQueries({
				queryKey: DASHBOARD_SIDEBAR_PULL_REQUEST_QUERY_KEY_PREFIX,
			});
		} catch (error) {
			toast.error(
				t({
					message: `Failed to remove PR link: ${errorMessage(error, "Unknown error")}`,
				}),
			);
		}
	};

	const handleCopyBranchName = async () => {
		if (!branch) {
			toast.error(
				t({
					message: "Branch name is not available",
				}),
			);
			return;
		}
		try {
			await copyToClipboard(branch);
			toast.success(
				t({
					message: "Branch name copied",
				}),
			);
		} catch (error) {
			toast.error(
				t({
					message: `Failed to copy branch name: ${errorMessage(error, "Unknown error")}`,
				}),
			);
		}
	};

	const handleCopyWorkspaceId = () => {
		toast.promise(copyToClipboard(workspaceId), {
			success: t({
				message: "Workspace ID copied",
			}),
			error: (error) =>
				t({
					message: `Failed to copy workspace ID: ${errorMessage(error, "Unknown error")}`,
				}),
		});
	};

	return {
		cancelRename,
		handleClearStatus,
		handleClick,
		handleCopyPath,
		handleCopyBranchName,
		handleCopyWorkspaceId,
		handleCreateSection,
		handleMoveToSection,
		handleOpenInFinder,
		handleRemoveFromSidebar,
		handleRemovePullRequest,
		handleTogglePin,
		handleToggleUnread,
		isActive,
		isRenaming,
		isUnread,
		pendingName,
		renameValue,
		requestDelete,
		setRenameValue,
		startRename,
		submitRename,
	};
}
