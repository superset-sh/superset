import { Button } from "@superset/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { cn } from "@superset/ui/utils";
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
import type {
	AccessibleV2Workspace,
	V2WorkspaceHostType,
} from "renderer/routes/_authenticated/_dashboard/v2-workspaces/hooks/useAccessibleV2Workspaces";
import { useDashboardSidebarState } from "renderer/routes/_authenticated/hooks/useDashboardSidebarState";
import { getRelativeTime } from "renderer/screens/main/components/WorkspacesListView/utils";
import { V2_WORKSPACES_ROW_GRID } from "../../constants";

interface V2WorkspaceRowProps {
	workspace: AccessibleV2Workspace;
	isCurrentRoute: boolean;
}

function hostIconFor(hostType: V2WorkspaceHostType) {
	switch (hostType) {
		case "cloud":
			return LuCloud;
		case "local-device":
			return LuLaptop;
		case "remote-device":
			return LuMonitor;
	}
}

export function V2WorkspaceRow({
	workspace,
	isCurrentRoute,
}: V2WorkspaceRowProps) {
	const navigate = useNavigate();
	const { ensureWorkspaceInSidebar, removeWorkspaceFromSidebar } =
		useDashboardSidebarState();

	const HostIcon = hostIconFor(workspace.hostType);

	// The local device is always reachable from here — ignore any stale
	// isOnline flag on that row.
	const treatAsOffline =
		!workspace.hostIsOnline && workspace.hostType !== "local-device";

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
			if (isCurrentRoute) {
				event.preventDefault();
				return;
			}
			removeWorkspaceFromSidebar(workspace.id);
		},
		[isCurrentRoute, removeWorkspaceFromSidebar, workspace.id],
	);

	const creatorLabel = workspace.isCreatedByCurrentUser
		? "you"
		: (workspace.createdByName ?? "unknown");

	const timeLabel = getRelativeTime(workspace.createdAt.getTime(), {
		format: "compact",
	});

	const handleRowKeyDown = useCallback(
		(event: React.KeyboardEvent<HTMLDivElement>) => {
			// Ignore keystrokes bubbling from focused descendants (e.g. the
			// Add/Remove icon buttons) — `stopPropagation` on their click handlers
			// doesn't catch keyboard events.
			if (event.target !== event.currentTarget) return;
			if (event.key === "Enter" || event.key === " ") {
				event.preventDefault();
				handleOpen();
			}
		},
		[handleOpen],
	);

	const hostCell = (
		<span
			className={cn(
				"hidden min-w-0 items-center gap-1.5 text-xs text-muted-foreground md:flex",
				treatAsOffline && "text-muted-foreground/60",
			)}
			title={workspace.hostName}
		>
			<HostIcon className="size-3 shrink-0" />
			<span className="min-w-0 truncate">{workspace.hostName}</span>
			{treatAsOffline ? (
				<span
					aria-hidden
					className="inline-block size-1.5 shrink-0 rounded-full bg-muted-foreground/40"
				/>
			) : null}
		</span>
	);

	return (
		<li
			aria-current={isCurrentRoute ? "page" : undefined}
			className="border-b border-border/50 last:border-b-0"
		>
			{/* biome-ignore lint/a11y/useSemanticElements: interactive row needs nested buttons, so the outer element is a div with role/tabIndex */}
			<div
				role="button"
				tabIndex={0}
				onClick={handleOpen}
				onKeyDown={handleRowKeyDown}
				className={cn(
					V2_WORKSPACES_ROW_GRID,
					"group/row relative min-w-0 px-6 py-2 text-sm outline-none",
					"cursor-pointer transition-colors",
					"focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:ring-inset",
					isCurrentRoute
						? "bg-muted hover:bg-muted focus-visible:bg-muted"
						: "hover:bg-accent/50 focus-visible:bg-accent/50",
				)}
			>
				<div className="flex items-center justify-center">
					{workspace.isInSidebar ? (
						<Tooltip delayDuration={300}>
							<TooltipTrigger asChild>
								<Button
									size="icon"
									variant="ghost"
									onClick={handleRemoveFromSidebar}
									aria-disabled={isCurrentRoute}
									aria-label="Remove from sidebar"
									className={cn(
										"size-7",
										isCurrentRoute && "cursor-not-allowed opacity-50",
									)}
								>
									<LuMinus className="size-3.5" />
								</Button>
							</TooltipTrigger>
							<TooltipContent side="right">
								{isCurrentRoute
									? "Can't remove the current workspace"
									: "Remove from sidebar"}
							</TooltipContent>
						</Tooltip>
					) : (
						<Tooltip delayDuration={300}>
							<TooltipTrigger asChild>
								<Button
									size="icon"
									variant="ghost"
									onClick={handleAddToSidebar}
									aria-label="Add to sidebar"
									className="size-7"
								>
									<LuPlus className="size-3.5" />
								</Button>
							</TooltipTrigger>
							<TooltipContent side="right">Add to sidebar</TooltipContent>
						</Tooltip>
					)}
				</div>

				<span className="flex min-w-0 items-center">
					<span
						className="min-w-0 truncate font-medium text-foreground"
						title={workspace.name}
					>
						{workspace.name}
					</span>
				</span>

				{treatAsOffline ? (
					<Tooltip delayDuration={300}>
						<TooltipTrigger asChild>{hostCell}</TooltipTrigger>
						<TooltipContent side="top">Host is offline</TooltipContent>
					</Tooltip>
				) : (
					hostCell
				)}

				<span
					className="hidden min-w-0 items-center gap-1.5 text-xs text-muted-foreground lg:flex"
					title={workspace.branch}
				>
					<LuGitBranch className="size-3 shrink-0" />
					<span className="min-w-0 truncate font-mono text-[11px]">
						{workspace.branch}
					</span>
				</span>

				<span
					className="hidden truncate text-xs tabular-nums text-muted-foreground xl:block"
					title={`Created ${workspace.createdAt.toLocaleString()} by ${creatorLabel}`}
				>
					{timeLabel} · {creatorLabel}
				</span>
			</div>
		</li>
	);
}
