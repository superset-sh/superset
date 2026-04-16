import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { cn } from "@superset/ui/utils";
import { type ComponentPropsWithoutRef, forwardRef } from "react";
import { HiChevronRight, HiMiniPlus } from "react-icons/hi2";
import { RenameInput } from "renderer/screens/main/components/WorkspaceSidebar/RenameInput";

interface DashboardSidebarProjectRowProps
	extends ComponentPropsWithoutRef<"div"> {
	projectName: string;
	githubOwner: string | null;
	githubRepoName?: string | null;
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
			githubRepoName,
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
					"group relative flex h-7 w-full items-center pl-4 pr-2 transition-colors",
					className,
				)}
				{...props}
			>
				<HiChevronRight
					className={cn(
						"absolute left-0.5 top-1/2 size-3 -translate-y-1/2 text-muted-foreground/60 opacity-0 transition-all duration-150 group-hover:opacity-100",
						!isCollapsed && "rotate-90",
					)}
				/>
				<div className="flex min-w-0 flex-1 items-center gap-2">
					{isRenaming ? (
						<RenameInput
							value={renameValue}
							onChange={onRenameValueChange}
							onSubmit={onSubmitRename}
							onCancel={onCancelRename}
							className="h-5 min-w-0 flex-1 bg-transparent border-none px-0 py-0 text-[14px] font-normal tracking-normal outline-none"
						/>
					) : (
						<span className="truncate text-[14px] font-normal lowercase tracking-normal">
							{githubOwner ? (
								<>
									<span className="text-muted-foreground/60">
										{githubOwner}/
									</span>
									<span className="text-foreground/80">
										{githubRepoName ?? projectName}
									</span>
								</>
							) : (
								<span className="text-foreground/80">{projectName}</span>
							)}
						</span>
					)}
					{!isRenaming && (
						<span className="shrink-0 text-[10px] font-normal tabular-nums text-muted-foreground/40 transition-opacity group-hover:opacity-0">
							{totalWorkspaceCount}
						</span>
					)}
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
							className="ml-1 shrink-0 rounded p-0.5 text-muted-foreground/60 opacity-0 transition hover:bg-muted hover:text-foreground group-hover:opacity-100"
						>
							<HiMiniPlus className="size-3.5" />
						</button>
					</TooltipTrigger>
					<TooltipContent side="bottom" sideOffset={4}>
						New workspace
					</TooltipContent>
				</Tooltip>
			</div>
		);
	},
);
