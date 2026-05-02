import { Button } from "@superset/ui/button";
import {
	HoverCard,
	HoverCardContent,
	HoverCardTrigger,
} from "@superset/ui/hover-card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { cn } from "@superset/ui/utils";
import { useNavigate } from "@tanstack/react-router";
import { useCallback } from "react";
import { CgLaptop } from "react-icons/cg";
import {
	LuCircleCheck,
	LuCircleDashed,
	LuCircleX,
	LuGitBranch,
	LuLaptop,
	LuMinus,
	LuMonitor,
	LuPlus,
} from "react-icons/lu";
import { GATED_FEATURES, usePaywall } from "renderer/components/Paywall";
import { navigateToV2Workspace } from "renderer/routes/_authenticated/_dashboard/utils/workspace-navigation";
import { V2WorkspacePrHoverCardContent } from "renderer/routes/_authenticated/_dashboard/v2-workspaces/components/V2WorkspacePrHoverCardContent";
import type {
	AccessibleV2Workspace,
	V2WorkspaceHostType,
	V2WorkspacePrSummary,
} from "renderer/routes/_authenticated/_dashboard/v2-workspaces/hooks/useAccessibleV2Workspaces";
import { useDashboardSidebarState } from "renderer/routes/_authenticated/hooks/useDashboardSidebarState";
import { PRIcon } from "renderer/screens/main/components/PRIcon/PRIcon";
import { getRelativeTime } from "renderer/screens/main/components/WorkspacesListView/utils";
import { V2_WORKSPACES_ROW_GRID } from "../../constants";

interface V2WorkspaceRowProps {
	workspace: AccessibleV2Workspace;
	isCurrentRoute: boolean;
}

function hostIconFor(hostType: V2WorkspaceHostType) {
	return hostType === "local-device" ? LuLaptop : LuMonitor;
}

export function V2WorkspaceRow({
	workspace,
	isCurrentRoute,
}: V2WorkspaceRowProps) {
	const navigate = useNavigate();
	const { gateFeature } = usePaywall();
	const {
		ensureWorkspaceInSidebar,
		hideWorkspaceInSidebar,
		removeWorkspaceFromSidebar,
	} = useDashboardSidebarState();
	const isMainWorkspace = workspace.type === "main";

	const HostIcon = hostIconFor(workspace.hostType);

	const treatAsOffline =
		!workspace.hostIsOnline && workspace.hostType !== "local-device";

	const handleOpen = useCallback(() => {
		const open = () => navigateToV2Workspace(workspace.id, navigate);
		if (workspace.hostType === "local-device") {
			open();
			return;
		}
		gateFeature(GATED_FEATURES.REMOTE_WORKSPACES, open);
	}, [gateFeature, navigate, workspace.hostType, workspace.id]);

	const handleAddToSidebar = useCallback(
		(event: React.MouseEvent) => {
			event.stopPropagation();
			const add = () =>
				ensureWorkspaceInSidebar(workspace.id, workspace.projectId);
			if (workspace.hostType === "local-device") {
				add();
				return;
			}
			gateFeature(GATED_FEATURES.REMOTE_WORKSPACES, add);
		},
		[
			ensureWorkspaceInSidebar,
			gateFeature,
			workspace.hostType,
			workspace.id,
			workspace.projectId,
		],
	);

	const handleRemoveFromSidebar = useCallback(
		(event: React.MouseEvent) => {
			event.stopPropagation();
			if (isCurrentRoute) {
				event.preventDefault();
				return;
			}
			if (isMainWorkspace) {
				hideWorkspaceInSidebar(workspace.id, workspace.projectId);
				return;
			}
			removeWorkspaceFromSidebar(workspace.id);
		},
		[
			hideWorkspaceInSidebar,
			isCurrentRoute,
			isMainWorkspace,
			removeWorkspaceFromSidebar,
			workspace.id,
			workspace.projectId,
		],
	);

	const creatorLabel = workspace.isCreatedByCurrentUser
		? "you"
		: (workspace.createdByName ?? "unknown");

	const timeLabel = getRelativeTime(workspace.createdAt.getTime(), {
		format: "compact",
	});

	const handleRowKeyDown = useCallback(
		(event: React.KeyboardEvent<HTMLDivElement>) => {
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
					"group/row relative min-w-0 px-6 py-2.5 text-sm outline-none",
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

				<span className="flex min-w-0 items-center gap-2">
					{isMainWorkspace ? (
						<Tooltip delayDuration={300}>
							<TooltipTrigger asChild>
								<CgLaptop
									className="size-3.5 shrink-0 text-muted-foreground"
									aria-label="Main workspace"
								/>
							</TooltipTrigger>
							<TooltipContent side="top">Main workspace</TooltipContent>
						</Tooltip>
					) : null}
					<span
						className="min-w-0 truncate font-medium text-foreground"
						title={workspace.name}
					>
						{workspace.name}
					</span>
					{workspace.pr ? (
						<WorkspacePrPill pr={workspace.pr} branch={workspace.branch} />
					) : null}
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

interface WorkspacePrPillProps {
	pr: V2WorkspacePrSummary;
	branch: string;
}

function WorkspacePrPill({ pr, branch }: WorkspacePrPillProps) {
	return (
		<HoverCard openDelay={200} closeDelay={120}>
			<HoverCardTrigger asChild>
				<a
					href={pr.url}
					target="_blank"
					rel="noreferrer"
					onClick={(event) => event.stopPropagation()}
					className="inline-flex shrink-0 items-center gap-1 rounded-full border border-border/60 bg-muted/40 px-2 py-0.5 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
				>
					<PRIcon state={pr.state} className="size-3" />
					<span className="tabular-nums">#{pr.prNumber}</span>
					<ChecksDot status={pr.checksStatus} />
				</a>
			</HoverCardTrigger>
			<HoverCardContent
				side="top"
				align="start"
				className="w-80 p-3"
				onClick={(event) => event.stopPropagation()}
			>
				<V2WorkspacePrHoverCardContent pr={pr} branch={branch} />
			</HoverCardContent>
		</HoverCard>
	);
}

interface ChecksDotProps {
	status: V2WorkspacePrSummary["checksStatus"];
}

function ChecksDot({ status }: ChecksDotProps) {
	if (status === "none") return null;
	if (status === "pending") {
		return <LuCircleDashed className="size-3 text-amber-500" />;
	}
	if (status === "success") {
		return <LuCircleCheck className="size-3 text-emerald-500" />;
	}
	return <LuCircleX className="size-3 text-red-500" />;
}
