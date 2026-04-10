import { Badge } from "@superset/ui/badge";
import { Button } from "@superset/ui/button";
import {
	Item,
	ItemActions,
	ItemContent,
	ItemDescription,
	ItemMedia,
	ItemTitle,
} from "@superset/ui/item";
import { useNavigate } from "@tanstack/react-router";
import { useCallback } from "react";
import {
	LuCloud,
	LuGitBranch,
	LuLaptop,
	LuMinus,
	LuMonitor,
	LuPlus,
} from "react-icons/lu";
import { navigateToV2Workspace } from "renderer/routes/_authenticated/_dashboard/utils/workspace-navigation";
import type { AccessibleV2Workspace } from "renderer/routes/_authenticated/_dashboard/v2-workspaces/hooks/useAccessibleV2Workspaces";
import { useDashboardSidebarState } from "renderer/routes/_authenticated/hooks/useDashboardSidebarState";
import { getRelativeTime } from "renderer/screens/main/components/WorkspacesListView/utils";
import { V2WorkspaceDeviceBadge } from "./components/V2WorkspaceDeviceBadge";

interface V2WorkspaceRowProps {
	workspace: AccessibleV2Workspace;
	showProjectName: boolean;
	isCurrentRoute: boolean;
}

export function V2WorkspaceRow({
	workspace,
	showProjectName,
	isCurrentRoute,
}: V2WorkspaceRowProps) {
	const navigate = useNavigate();
	const { ensureWorkspaceInSidebar, removeWorkspaceFromSidebar } =
		useDashboardSidebarState();

	const HostIcon =
		workspace.hostType === "cloud"
			? LuCloud
			: workspace.hostType === "local-device"
				? LuLaptop
				: LuMonitor;

	const handleOpen = useCallback(() => {
		navigateToV2Workspace(workspace.id, navigate);
	}, [navigate, workspace.id]);

	const handleAddToSidebar = useCallback(
		(event: React.MouseEvent) => {
			event.stopPropagation();
			ensureWorkspaceInSidebar(workspace.id, workspace.projectId);
		},
		[ensureWorkspaceInSidebar, workspace.id, workspace.projectId],
	);

	const handleRemoveFromSidebar = useCallback(
		(event: React.MouseEvent) => {
			event.stopPropagation();
			removeWorkspaceFromSidebar(workspace.id);
		},
		[removeWorkspaceFromSidebar, workspace.id],
	);

	const creatorLabel = workspace.isCreatedByCurrentUser
		? "you"
		: (workspace.createdByName ?? "unknown");

	const handleRowKeyDown = useCallback(
		(event: React.KeyboardEvent<HTMLDivElement>) => {
			if (event.key === "Enter" || event.key === " ") {
				event.preventDefault();
				handleOpen();
			}
		},
		[handleOpen],
	);

	return (
		<Item
			variant="outline"
			size="sm"
			role="button"
			tabIndex={0}
			onClick={handleOpen}
			onKeyDown={handleRowKeyDown}
			className="cursor-pointer border-border/60 outline-none hover:bg-accent/50 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
		>
			<ItemMedia variant="icon">
				<HostIcon className="size-4" />
			</ItemMedia>

			<ItemContent>
				<ItemTitle>
					<span className="truncate">{workspace.name}</span>
				</ItemTitle>
				<ItemDescription className="flex flex-wrap items-center gap-2">
					{showProjectName ? (
						<span className="font-medium text-foreground/70">
							{workspace.projectName}
						</span>
					) : null}
					<Badge variant="secondary" className="gap-1 font-normal">
						<LuGitBranch className="size-3" />
						<span className="max-w-[16rem] truncate">{workspace.branch}</span>
					</Badge>
					<V2WorkspaceDeviceBadge
						hostType={workspace.hostType}
						hostName={workspace.hostName}
						isOnline={workspace.hostIsOnline}
					/>
					<span className="text-xs text-muted-foreground">
						{getRelativeTime(workspace.createdAt.getTime(), {
							format: "compact",
						})}{" "}
						by {creatorLabel}
					</span>
				</ItemDescription>
			</ItemContent>

			<ItemActions>
				{workspace.isInSidebar ? (
					<Button
						size="sm"
						variant="outline"
						onClick={handleRemoveFromSidebar}
						disabled={isCurrentRoute}
						className="gap-1.5"
					>
						<LuMinus className="size-3.5" />
						Remove from sidebar
					</Button>
				) : (
					<Button
						size="sm"
						variant="default"
						onClick={handleAddToSidebar}
						className="gap-1.5"
					>
						<LuPlus className="size-3.5" />
						Add to sidebar
					</Button>
				)}
			</ItemActions>
		</Item>
	);
}
