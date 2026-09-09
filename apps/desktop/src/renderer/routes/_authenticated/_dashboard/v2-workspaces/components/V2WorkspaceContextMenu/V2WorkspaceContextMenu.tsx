import { Trans, useLingui } from "@lingui/react/macro";
import { errorMessage } from "@superset/i18n/errors";
import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuSeparator,
	ContextMenuTrigger,
} from "@superset/ui/context-menu";
import { toast } from "@superset/ui/sonner";
import { useNavigate } from "@tanstack/react-router";
import { type ReactNode, useCallback } from "react";
import {
	LuArrowUpRight,
	LuGitBranch,
	LuPanelLeftClose,
	LuPanelLeftOpen,
	LuTrash2,
} from "react-icons/lu";
import { GATED_FEATURES, usePaywall } from "renderer/components/Paywall";
import { useCopyToClipboard } from "renderer/hooks/useCopyToClipboard";
import { navigateToV2Workspace } from "renderer/routes/_authenticated/_dashboard/utils/workspace-navigation";
import type { AccessibleV2Workspace } from "renderer/routes/_authenticated/_dashboard/v2-workspaces/hooks/useAccessibleV2Workspaces";
import { useDashboardSidebarState } from "renderer/routes/_authenticated/hooks/useDashboardSidebarState";
import { useDeleteWorkspaceIntent } from "renderer/stores/delete-workspace-intent";

export interface V2WorkspaceActions {
	/** Navigate to the workspace (paywall-gated for remote hosts). */
	open: () => void;
	addToSidebar: () => void;
	removeFromSidebar: () => void;
	openDeleteDialog: () => void;
}

interface V2WorkspaceContextMenuProps {
	workspace: AccessibleV2Workspace;
	/** Hiding the current route's workspace from the sidebar is blocked. */
	isCurrentRoute?: boolean;
	/** Rendered as the context-menu trigger; receives the shared actions so
	 * inline affordances (pin cell, trash button, card click) reuse them. */
	children: (actions: V2WorkspaceActions) => ReactNode;
}

/**
 * Right-click menu + delete-dialog wiring shared by the list rows and the
 * board cards. Owns the workspace actions so both surfaces stay identical.
 */
export function V2WorkspaceContextMenu({
	workspace,
	isCurrentRoute = false,
	children,
}: V2WorkspaceContextMenuProps) {
	const { t } = useLingui();
	const navigate = useNavigate();
	const { gateFeature } = usePaywall();
	const { ensureWorkspaceInSidebar, hideWorkspaceInSidebar } =
		useDashboardSidebarState();
	const { copyToClipboard } = useCopyToClipboard();
	const isMainWorkspace = workspace.type === "main";

	const open = useCallback(() => {
		const go = () => navigateToV2Workspace(workspace.id, navigate);
		if (workspace.hostType === "local-device") {
			go();
			return;
		}
		gateFeature(GATED_FEATURES.REMOTE_ACCESS, go);
	}, [gateFeature, navigate, workspace.hostType, workspace.id]);

	const addToSidebar = useCallback(() => {
		const add = () =>
			ensureWorkspaceInSidebar(workspace.id, workspace.projectId);
		if (workspace.hostType === "local-device") {
			add();
			return;
		}
		gateFeature(GATED_FEATURES.REMOTE_ACCESS, add);
	}, [
		ensureWorkspaceInSidebar,
		gateFeature,
		workspace.hostType,
		workspace.id,
		workspace.projectId,
	]);

	const removeFromSidebar = useCallback(() => {
		if (isCurrentRoute) return;
		// Hide directly (synchronous optimistic write) rather than routing
		// through the intent store + RemoveFromSidebarMount effect, which adds
		// an extra render cycle of latency. The list view is never a workspace
		// route, so there's no active workspace to navigate away from.
		//
		// Always hide (keep the row with isHidden) rather than delete: the
		// auto-add-local-workspaces hook treats a missing v2WorkspaceLocalState
		// row as never-seen and would show it again. The tombstone row preserves
		// the hidden state.
		hideWorkspaceInSidebar(workspace.id, workspace.projectId);
	}, [
		isCurrentRoute,
		hideWorkspaceInSidebar,
		workspace.id,
		workspace.projectId,
	]);

	const handleCopyBranchName = useCallback(async () => {
		try {
			await copyToClipboard(workspace.branch);
			toast.success(
				t({
					message: "Branch name copied",
				}),
			);
		} catch (error) {
			toast.error(
				t({
					message: `Failed to copy branch name: ${errorMessage(
						error,
						t({
							message: "Unknown error",
						}),
					)}`,
				}),
			);
		}
	}, [copyToClipboard, workspace.branch, t]);

	// Globally-mounted dialog (DeleteWorkspaceMount): archive-first
	// tombstoning drops this row the moment the destroy starts, which
	// would unmount a row-local dialog mid-flight.
	const openDeleteDialog = useCallback(() => {
		useDeleteWorkspaceIntent.getState().request({
			workspaceId: workspace.id,
			workspaceName: workspace.name || workspace.branch,
		});
	}, [workspace.id, workspace.name, workspace.branch]);

	return (
		<ContextMenu>
			<ContextMenuTrigger asChild>
				{children({
					open,
					addToSidebar,
					removeFromSidebar,
					openDeleteDialog,
				})}
			</ContextMenuTrigger>
			<ContextMenuContent onCloseAutoFocus={(event) => event.preventDefault()}>
				<ContextMenuItem onSelect={open}>
					<LuArrowUpRight className="size-4" />
					<Trans>Open</Trans>
				</ContextMenuItem>
				<ContextMenuItem onSelect={handleCopyBranchName}>
					<LuGitBranch className="size-4" />
					<Trans>Copy Branch Name</Trans>
				</ContextMenuItem>
				<ContextMenuSeparator />
				{workspace.isInSidebar ? (
					<ContextMenuItem
						onSelect={removeFromSidebar}
						disabled={isCurrentRoute}
					>
						<LuPanelLeftClose className="size-4" />
						<Trans>Hide from Sidebar</Trans>
					</ContextMenuItem>
				) : (
					<ContextMenuItem onSelect={addToSidebar}>
						<LuPanelLeftOpen className="size-4" />
						<Trans>Show on Sidebar</Trans>
					</ContextMenuItem>
				)}
				{!isMainWorkspace ? (
					<>
						<ContextMenuSeparator />
						<ContextMenuItem
							onSelect={openDeleteDialog}
							className="text-destructive focus:text-destructive"
						>
							<LuTrash2 className="size-4 text-destructive" />
							<Trans>Delete</Trans>
						</ContextMenuItem>
					</>
				) : null}
			</ContextMenuContent>
		</ContextMenu>
	);
}
