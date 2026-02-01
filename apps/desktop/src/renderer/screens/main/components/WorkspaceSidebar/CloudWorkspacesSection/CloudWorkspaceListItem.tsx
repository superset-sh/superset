import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuSeparator,
	ContextMenuTrigger,
} from "@superset/ui/context-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { cn } from "@superset/ui/utils";
import {
	LuArchive,
	LuCloud,
	LuExternalLink,
	LuGitBranch,
} from "react-icons/lu";
import type { ApiRouterOutputs } from "renderer/lib/api-trpc";
import { AsciiSpinner } from "renderer/screens/main/components/AsciiSpinner";
import { StatusIndicator } from "renderer/screens/main/components/StatusIndicator";
import type { ActivePaneStatus } from "shared/tabs-types";
import { STROKE_WIDTH } from "../constants";

type CloudWorkspace = ApiRouterOutputs["cloudWorkspace"]["list"][number];

interface CloudWorkspaceListItemProps {
	workspace: CloudWorkspace;
	isActive: boolean;
	isCollapsed?: boolean;
	onArchive?: () => void;
	onSelect?: () => void;
}

const SANDBOX_STATUS_TO_PANE_STATUS: Record<
	string,
	ActivePaneStatus | undefined
> = {
	pending: undefined,
	warming: "working",
	syncing: "working",
	ready: undefined,
	running: "working",
	stopped: undefined,
	failed: "permission", // Use permission status for failed (shows red)
};

export function CloudWorkspaceListItem({
	workspace,
	isActive,
	isCollapsed = false,
	onArchive,
	onSelect,
}: CloudWorkspaceListItemProps) {
	const handleClick = () => {
		onSelect?.();
	};

	const handleOpenPR = () => {
		if (workspace.prUrl) {
			window.open(workspace.prUrl, "_blank");
		}
	};

	const status: ActivePaneStatus | undefined = workspace.sandboxStatus
		? SANDBOX_STATUS_TO_PANE_STATUS[workspace.sandboxStatus]
		: undefined;

	// Collapsed sidebar: show just the icon with tooltip
	if (isCollapsed) {
		return (
			<Tooltip delayDuration={300}>
				<ContextMenu>
					<TooltipTrigger asChild>
						<ContextMenuTrigger asChild>
							<button
								type="button"
								onClick={handleClick}
								className={cn(
									"relative flex items-center justify-center size-8 rounded-md",
									"hover:bg-muted/50 transition-colors",
									isActive && "bg-muted",
								)}
							>
								{status === "working" ? (
									<AsciiSpinner className="text-base" />
								) : (
									<LuCloud
										className={cn(
											"size-4",
											isActive ? "text-foreground" : "text-muted-foreground",
										)}
										strokeWidth={STROKE_WIDTH}
									/>
								)}
								{status && status !== "working" && (
									<span className="absolute top-1 right-1">
										<StatusIndicator status={status} />
									</span>
								)}
							</button>
						</ContextMenuTrigger>
					</TooltipTrigger>
					<ContextMenuContent>
						{workspace.prUrl && (
							<>
								<ContextMenuItem onSelect={handleOpenPR}>
									<LuExternalLink
										className="size-4 mr-2"
										strokeWidth={STROKE_WIDTH}
									/>
									Open PR
								</ContextMenuItem>
								<ContextMenuSeparator />
							</>
						)}
						{onArchive && (
							<ContextMenuItem onSelect={onArchive}>
								<LuArchive className="size-4 mr-2" strokeWidth={STROKE_WIDTH} />
								Archive
							</ContextMenuItem>
						)}
					</ContextMenuContent>
				</ContextMenu>
				<TooltipContent side="right" className="flex flex-col gap-0.5">
					<span className="font-medium">{workspace.title}</span>
					<span className="text-xs text-muted-foreground">
						{workspace.repoOwner}/{workspace.repoName}
					</span>
				</TooltipContent>
			</Tooltip>
		);
	}

	// Expanded sidebar: full item view
	return (
		<ContextMenu>
			<ContextMenuTrigger asChild>
				<button
					type="button"
					onClick={handleClick}
					className={cn(
						"flex items-center w-full pl-3 pr-2 py-1.5 text-sm",
						"hover:bg-muted/50 transition-colors text-left cursor-pointer",
						"group relative",
						isActive && "bg-muted",
					)}
				>
					{/* Active indicator - left border */}
					{isActive && (
						<div className="absolute left-0 top-0 bottom-0 w-0.5 bg-primary rounded-r" />
					)}

					{/* Icon with status indicator */}
					<div className="relative shrink-0 size-5 flex items-center justify-center mr-2.5">
						{status === "working" ? (
							<AsciiSpinner className="text-base" />
						) : (
							<LuCloud
								className={cn(
									"size-4 transition-colors",
									isActive ? "text-foreground" : "text-muted-foreground",
								)}
								strokeWidth={STROKE_WIDTH}
							/>
						)}
						{status && status !== "working" && (
							<span className="absolute -top-0.5 -right-0.5">
								<StatusIndicator status={status} />
							</span>
						)}
					</div>

					{/* Content area */}
					<div className="flex-1 min-w-0">
						<div className="flex flex-col gap-0.5">
							{/* Row 1: Title */}
							<div className="flex items-center gap-1.5">
								<span
									className={cn(
										"truncate text-[13px] leading-tight transition-colors flex-1",
										isActive
											? "text-foreground font-medium"
											: "text-foreground/80",
									)}
								>
									{workspace.title}
								</span>
								{workspace.prNumber && (
									<span className="text-[10px] text-muted-foreground font-mono shrink-0">
										#{workspace.prNumber}
									</span>
								)}
							</div>

							{/* Row 2: Branch info */}
							<div className="flex items-center gap-1 text-[11px] text-muted-foreground/60">
								<LuGitBranch
									className="size-3 shrink-0"
									strokeWidth={STROKE_WIDTH}
								/>
								<span className="truncate font-mono leading-tight">
									{workspace.branch}
								</span>
							</div>
						</div>
					</div>
				</button>
			</ContextMenuTrigger>
			<ContextMenuContent>
				{workspace.prUrl && (
					<>
						<ContextMenuItem onSelect={handleOpenPR}>
							<LuExternalLink
								className="size-4 mr-2"
								strokeWidth={STROKE_WIDTH}
							/>
							Open PR
						</ContextMenuItem>
						<ContextMenuSeparator />
					</>
				)}
				{onArchive && (
					<ContextMenuItem onSelect={onArchive}>
						<LuArchive className="size-4 mr-2" strokeWidth={STROKE_WIDTH} />
						Archive
					</ContextMenuItem>
				)}
			</ContextMenuContent>
		</ContextMenu>
	);
}
