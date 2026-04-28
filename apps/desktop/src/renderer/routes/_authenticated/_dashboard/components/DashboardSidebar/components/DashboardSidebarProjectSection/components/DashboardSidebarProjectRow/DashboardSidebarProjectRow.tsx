import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { cn } from "@superset/ui/utils";
import { type ComponentPropsWithoutRef, forwardRef } from "react";
import { HiChevronRight, HiMiniPlus } from "react-icons/hi2";
import { ProjectThumbnail } from "renderer/routes/_authenticated/components/ProjectThumbnail";
import { RenameInput } from "renderer/screens/main/components/WorkspaceSidebar/RenameInput";

interface DashboardSidebarProjectRowProps
	extends ComponentPropsWithoutRef<"div"> {
	projectName: string;
	githubOwner: string | null;
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
}

export const DashboardSidebarProjectRow = forwardRef<
	HTMLDivElement,
	DashboardSidebarProjectRowProps
>(
	(
		{
			projectName,
			githubOwner,
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
					<div className="flex size-5 shrink-0 items-center justify-center">
						<ProjectThumbnail
							projectName={projectName}
							githubOwner={githubOwner}
							className="size-4 group-hover:hidden"
						/>
						<HiChevronRight
							className={cn(
								"hidden size-4 text-muted-foreground transition-transform group-hover:block",
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
				</div>

				{!isRenaming && (
					<div className="ml-1 flex size-6 shrink-0 items-center justify-center">
						<Tooltip delayDuration={500}>
							<TooltipTrigger asChild>
								<button
									type="button"
									onClick={(event) => {
										event.stopPropagation();
										onNewWorkspace();
									}}
									onKeyDown={(event) => event.stopPropagation()}
									onContextMenu={(event) => event.stopPropagation()}
									aria-label="New workspace"
									className="hidden size-full items-center justify-center rounded transition-colors hover:bg-muted group-hover:flex group-has-[:focus]:flex focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
								>
									<HiMiniPlus className="size-4 text-muted-foreground" />
								</button>
							</TooltipTrigger>
							<TooltipContent side="bottom" sideOffset={4}>
								New workspace
							</TooltipContent>
						</Tooltip>
						<span className="text-[10px] font-normal tabular-nums text-muted-foreground group-hover:hidden group-has-[:focus]:hidden">
							{totalWorkspaceCount}
						</span>
					</div>
				)}
			</div>
		);
	},
);
