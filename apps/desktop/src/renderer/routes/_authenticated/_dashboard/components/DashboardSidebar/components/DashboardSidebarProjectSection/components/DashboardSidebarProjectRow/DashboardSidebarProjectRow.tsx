import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { cn } from "@superset/ui/utils";
import { type ComponentPropsWithoutRef, forwardRef } from "react";
import { HiChevronRight, HiMiniPlus } from "react-icons/hi2";
import { LuPencil } from "react-icons/lu";
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
					<ProjectThumbnail
						projectName={projectName}
						githubOwner={githubOwner}
					/>
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
					<div className="grid shrink-0 items-center [&>*]:col-start-1 [&>*]:row-start-1">
						{!isRenaming && (
							<span className="text-xs font-normal tabular-nums text-muted-foreground transition-all duration-150 group-hover:scale-95 group-hover:opacity-0">
								({totalWorkspaceCount})
							</span>
						)}
						{!isRenaming && (
							<button
								type="button"
								onClick={(event) => {
									event.stopPropagation();
									onStartRename();
								}}
								className="flex items-center justify-center opacity-0 scale-90 text-muted-foreground transition-all duration-150 group-hover:scale-100 group-hover:opacity-100 hover:text-foreground"
								aria-label="Rename project"
							>
								<LuPencil className="size-3.5 transition-transform duration-150 group-hover:rotate-[-8deg]" />
							</button>
						)}
					</div>
				</div>

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

				<button
					type="button"
					onClick={(event) => {
						event.stopPropagation();
						onToggleCollapse();
					}}
					onContextMenu={(event) => event.stopPropagation()}
					aria-expanded={!isCollapsed}
					className="p-1 rounded hover:bg-muted transition-colors shrink-0 ml-1"
				>
					<HiChevronRight
						className={cn(
							"size-3.5 text-muted-foreground transition-transform duration-150",
							!isCollapsed && "rotate-90",
						)}
					/>
				</button>
			</div>
		);
	},
);
