import { Button } from "@superset/ui/button";
import {
	HoverCard,
	HoverCardContent,
	HoverCardTrigger,
} from "@superset/ui/hover-card";
import { TableCell, TableRow } from "@superset/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { cn } from "@superset/ui/utils";
import { CgLaptop } from "react-icons/cg";
import { LuGitBranch, LuLaptop, LuMonitor, LuTrash2 } from "react-icons/lu";
import { RiPushpinFill, RiPushpinLine } from "react-icons/ri";
import { V2WorkspaceContextMenu } from "renderer/routes/_authenticated/_dashboard/v2-workspaces/components/V2WorkspaceContextMenu";
import { V2WorkspacePrHoverCardContent } from "renderer/routes/_authenticated/_dashboard/v2-workspaces/components/V2WorkspacePrHoverCardContent";
import { WorkspaceChecksDot } from "renderer/routes/_authenticated/_dashboard/v2-workspaces/components/WorkspaceChecksDot";
import type {
	AccessibleV2Workspace,
	V2WorkspaceHostType,
	V2WorkspacePrSummary,
} from "renderer/routes/_authenticated/_dashboard/v2-workspaces/hooks/useAccessibleV2Workspaces";
import { PRIcon } from "renderer/screens/main/components/PRIcon/PRIcon";
import { getRelativeTime } from "renderer/screens/main/components/WorkspacesListView/utils";

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
	const isMainWorkspace = workspace.type === "main";

	const HostIcon = hostIconFor(workspace.hostType);

	const treatAsOffline =
		!workspace.hostIsOnline && workspace.hostType !== "local-device";

	const creatorLabel = workspace.isCreatedByCurrentUser
		? "you"
		: (workspace.createdByName ?? "unknown");

	const timeLabel = getRelativeTime(workspace.createdAt.getTime(), {
		format: "compact",
	});

	const hostCell = (
		<span
			className={cn(
				"flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground",
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
		<V2WorkspaceContextMenu
			workspace={workspace}
			isCurrentRoute={isCurrentRoute}
		>
			{(actions) => (
				<TableRow
					aria-current={isCurrentRoute ? "page" : undefined}
					tabIndex={0}
					onClick={actions.open}
					onKeyDown={(event) => {
						if (event.target !== event.currentTarget) return;
						if (event.key === "Enter" || event.key === " ") {
							event.preventDefault();
							actions.open();
						}
					}}
					className={cn(
						"group/row border-border/50 text-sm outline-none",
						"cursor-pointer transition-colors",
						"focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:ring-inset",
						isCurrentRoute
							? "bg-muted hover:bg-muted focus-visible:bg-muted"
							: "hover:bg-accent/50 focus-visible:bg-accent/50",
					)}
				>
					<TableCell className="py-1.5 pl-6">
						<div className="flex items-center justify-center">
							{workspace.isInSidebar ? (
								<Tooltip delayDuration={300}>
									<TooltipTrigger asChild>
										<Button
											size="icon"
											variant="ghost"
											onClick={(event) => {
												event.stopPropagation();
												actions.removeFromSidebar();
											}}
											aria-disabled={isCurrentRoute}
											aria-pressed
											aria-label="Unpin from sidebar"
											className={cn(
												"size-7 text-foreground hover:bg-transparent hover:text-muted-foreground dark:hover:bg-transparent",
												isCurrentRoute && "cursor-not-allowed opacity-50",
											)}
										>
											<RiPushpinFill className="size-4" />
										</Button>
									</TooltipTrigger>
									<TooltipContent side="right">
										{isCurrentRoute
											? "Can't unpin the current workspace"
											: "Unpin from sidebar"}
									</TooltipContent>
								</Tooltip>
							) : (
								<Tooltip delayDuration={300}>
									<TooltipTrigger asChild>
										<Button
											size="icon"
											variant="ghost"
											onClick={(event) => {
												event.stopPropagation();
												actions.addToSidebar();
											}}
											aria-pressed={false}
											aria-label="Pin to sidebar"
											className="size-7 text-muted-foreground hover:bg-transparent hover:text-foreground dark:hover:bg-transparent"
										>
											<RiPushpinLine className="size-4" />
										</Button>
									</TooltipTrigger>
									<TooltipContent side="right">Pin to sidebar</TooltipContent>
								</Tooltip>
							)}
						</div>
					</TableCell>

					<TableCell className="py-1.5">
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
					</TableCell>

					<TableCell className="hidden py-1.5 md:table-cell">
						{treatAsOffline ? (
							<Tooltip delayDuration={300}>
								<TooltipTrigger asChild>{hostCell}</TooltipTrigger>
								<TooltipContent side="top">Host is offline</TooltipContent>
							</Tooltip>
						) : (
							hostCell
						)}
					</TableCell>

					<TableCell className="hidden py-1.5 lg:table-cell">
						<span
							className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground"
							title={workspace.branch}
						>
							<LuGitBranch className="size-3 shrink-0" />
							<span className="min-w-0 truncate font-mono text-[11px]">
								{workspace.branch}
							</span>
						</span>
					</TableCell>

					<TableCell
						className="hidden truncate py-1.5 text-xs tabular-nums text-muted-foreground xl:table-cell"
						title={`Created ${workspace.createdAt.toLocaleString()} by ${creatorLabel}`}
					>
						{timeLabel} · {creatorLabel}
					</TableCell>

					<TableCell className="py-1.5 pr-6">
						<div className="flex items-center justify-center">
							{!isMainWorkspace ? (
								<Button
									size="icon"
									variant="ghost"
									onClick={(event) => {
										event.stopPropagation();
										actions.openDeleteDialog();
									}}
									aria-label="Delete workspace"
									className="size-7 text-muted-foreground opacity-0 transition-opacity hover:bg-transparent hover:text-destructive focus-visible:opacity-100 group-hover/row:opacity-100 dark:hover:bg-transparent"
								>
									<LuTrash2 className="size-3.5" />
								</Button>
							) : null}
						</div>
					</TableCell>
				</TableRow>
			)}
		</V2WorkspaceContextMenu>
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
					<WorkspaceChecksDot status={pr.checksStatus} />
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
