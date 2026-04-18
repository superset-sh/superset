import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { cn } from "@superset/ui/utils";
import { type ComponentPropsWithoutRef, forwardRef } from "react";
import { HiChevronRight, HiMiniPlus } from "react-icons/hi2";
import { ProjectThumbnail } from "renderer/routes/_authenticated/components/ProjectThumbnail";
import { RenameInput } from "renderer/screens/main/components/WorkspaceSidebar/RenameInput";
import type { DashboardSidebarProjectBackingState } from "../../../../types";
import { ProjectBackingStateIndicator } from "../ProjectBackingStateIndicator";

interface DashboardSidebarProjectRowProps
	extends ComponentPropsWithoutRef<"div"> {
	projectName: string;
	githubOwner: string | null;
	backingState: DashboardSidebarProjectBackingState;
	totalWorkspaceCount: number;
	isCollapsed: boolean;
	isRenaming: boolean;
	renameValue: string;
	onRenameValueChange: (value: string) => void;
	onSubmitRename: () => void;
	onCancelRename: () => void;
	onStartRename: () => void;
	onToggleCollapse: () => void;
	onNewWorkspace: () => void;
	onSetUpHere: () => void;
}

export const DashboardSidebarProjectRow = forwardRef<
	HTMLDivElement,
	DashboardSidebarProjectRowProps
>(
	(
		{
			projectName,
			githubOwner,
			backingState,
			totalWorkspaceCount,
			isCollapsed,
			isRenaming,
			renameValue,
			onRenameValueChange,
			onSubmitRename,
			onCancelRename,
			onStartRename,
			onToggleCollapse,
			onNewWorkspace,
			onSetUpHere,
			className,
			...props
		},
		ref,
	) => {
		return (
			// biome-ignore lint/a11y/noStaticElementInteractions: The header acts as a single toggle target in view mode while preserving nested inline controls.
			<div
				ref={ref}
				role={isRenaming ? undefined : "button"}
				tabIndex={isRenaming ? undefined : 0}
				onClick={isRenaming ? undefined : onToggleCollapse}
				onDoubleClick={isRenaming ? undefined : onStartRename}
				onKeyDown={
					isRenaming
						? undefined
						: (event) => {
								if (event.key === "Enter" || event.key === " ") {
									event.preventDefault();
									onToggleCollapse();
								}
							}
				}
				className={cn(
					"group flex min-h-10 w-full items-center pl-3 pr-2 py-1.5 text-sm font-medium",
					"hover:bg-muted/50 transition-colors",
					className,
				)}
				{...props}
			>
				<div className="flex min-w-0 flex-1 items-center gap-2 py-0.5">
					<div className="relative shrink-0 size-5 flex items-center justify-center">
						<span className="group-hover:opacity-0 transition-opacity duration-150">
							<ProjectThumbnail
								projectName={projectName}
								githubOwner={githubOwner}
								className="size-4"
							/>
						</span>
						<HiChevronRight
							className={cn(
								"absolute inset-0 m-auto size-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-all duration-150",
								!isCollapsed && "rotate-90",
							)}
						/>
					</div>
					{isRenaming ? (
						<RenameInput
							value={renameValue}
							onChange={onRenameValueChange}
							onSubmit={onSubmitRename}
							onCancel={onCancelRename}
							className="-ml-1 h-6 min-w-0 flex-1 bg-transparent border-none px-1 py-0 text-sm font-medium outline-none"
						/>
					) : (
						<span className="truncate">{projectName}</span>
					)}
					{!isRenaming && (
						<span className="shrink-0 text-xs font-normal tabular-nums text-muted-foreground">
							({totalWorkspaceCount})
						</span>
					)}
					{/* Only render the passive "Offline" marker here — the
					    "Not set up here" state surfaces as the Set up button on
					    the right instead, which is actionable. */}
					{!isRenaming && backingState === "host-offline" && (
						<ProjectBackingStateIndicator state={backingState} />
					)}
				</div>

				{!isRenaming && backingState === "not-set-up-here" ? (
					<button
						type="button"
						onClick={(event) => {
							event.stopPropagation();
							onSetUpHere();
						}}
						onContextMenu={(event) => event.stopPropagation()}
						className="shrink-0 ml-1 rounded px-2 py-0.5 text-xs font-medium text-amber-600 hover:bg-amber-500/10 dark:text-amber-400 transition-colors"
					>
						Set up
					</button>
				) : (
					<Tooltip delayDuration={500}>
						<TooltipTrigger asChild>
							<button
								type="button"
								onClick={(event) => {
									event.stopPropagation();
									onNewWorkspace();
								}}
								onContextMenu={(event) => event.stopPropagation()}
								className="p-1 rounded hover:bg-muted transition-colors shrink-0 ml-1"
							>
								<HiMiniPlus className="size-4 text-muted-foreground" />
							</button>
						</TooltipTrigger>
						<TooltipContent side="bottom" sideOffset={4}>
							New workspace
						</TooltipContent>
					</Tooltip>
				)}
			</div>
		);
	},
);
