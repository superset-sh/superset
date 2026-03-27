import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { cn } from "@superset/ui/utils";
import { type ComponentPropsWithoutRef, forwardRef, useMemo } from "react";
import { HiMiniXMark } from "react-icons/hi2";
import { RenameInput } from "renderer/screens/main/components/WorkspaceSidebar/RenameInput";
import type { DashboardSidebarWorkspace } from "../../../../types";
import type { WorkspaceRowMockData } from "../../utils";
import { getCreationStatusText } from "../../utils/getCreationStatusText";
import { DashboardSidebarWorkspaceDiffStats } from "../DashboardSidebarWorkspaceDiffStats";
import { DashboardSidebarWorkspaceIcon } from "../DashboardSidebarWorkspaceIcon";
import { DashboardSidebarWorkspaceStatusBadge } from "../DashboardSidebarWorkspaceStatusBadge";

interface DashboardSidebarExpandedWorkspaceRowProps
	extends ComponentPropsWithoutRef<"div"> {
	workspace: DashboardSidebarWorkspace;
	isActive: boolean;
	isRenaming: boolean;
	renameValue: string;
	shortcutLabel?: string;
	mockData: WorkspaceRowMockData;
	onClick?: () => void;
	onDoubleClick?: () => void;
	onDeleteClick: () => void;
	onRenameValueChange: (value: string) => void;
	onSubmitRename: () => void;
	onCancelRename: () => void;
}

export const DashboardSidebarExpandedWorkspaceRow = forwardRef<
	HTMLDivElement,
	DashboardSidebarExpandedWorkspaceRowProps
>(
	(
		{
			workspace,
			isActive,
			isRenaming,
			renameValue,
			shortcutLabel,
			mockData,
			onClick,
			onDoubleClick,
			onDeleteClick,
			onRenameValueChange,
			onSubmitRename,
			onCancelRename,
			className,
			...props
		},
		ref,
	) => {
		const {
			accentColor = null,
			hostType,
			name,
			branch,
			pullRequest,
			creationStatus,
		} = workspace;
		const showBranchSubtitle = !!name && name !== branch;
		const showSubtitle = showBranchSubtitle || !!pullRequest;
		const showsStandaloneActiveStripe = accentColor == null;

		const creationStatusText = useMemo(
			() => getCreationStatusText(creationStatus),
			[creationStatus],
		);

		return (
			// biome-ignore lint/a11y/noStaticElementInteractions: Mirrors the legacy sidebar row UI, which includes nested action buttons.
			<div
				role={onClick ? "button" : undefined}
				tabIndex={onClick ? 0 : undefined}
				aria-disabled={creationStatus ? true : undefined}
				ref={ref}
				onClick={onClick}
				onKeyDown={(event) => {
					if (onClick && (event.key === "Enter" || event.key === " ")) {
						event.preventDefault();
						onClick();
					}
				}}
				onDoubleClick={onDoubleClick}
				className={cn(
					"relative flex w-full items-center pl-3 pr-2 text-left text-sm",
					onClick && "cursor-pointer hover:bg-muted/50",
					"transition-colors group",
					showSubtitle ? "py-1.5" : "py-2",
					isActive && "bg-muted",
					className,
				)}
				{...props}
			>
				{isActive && showsStandaloneActiveStripe && (
					<div
						className="absolute top-0 bottom-0 left-0 w-0.5 rounded-r"
						style={{ backgroundColor: "var(--color-foreground)" }}
					/>
				)}

				<Tooltip delayDuration={500}>
					<TooltipTrigger asChild>
						<div className="relative mr-2.5 flex size-5 shrink-0 items-center justify-center">
							<DashboardSidebarWorkspaceIcon
								hostType={hostType}
								isActive={isActive}
								variant="expanded"
								workspaceStatus={mockData.workspaceStatus}
								creationStatus={creationStatus}
							/>
						</div>
					</TooltipTrigger>
					<TooltipContent side="right" sideOffset={8}>
						<p className="text-xs font-medium">Worktree workspace</p>
						<p className="text-xs text-muted-foreground">
							Isolated copy for parallel development
						</p>
					</TooltipContent>
				</Tooltip>

				<div className="flex min-w-0 flex-1 flex-col justify-center">
					{showSubtitle ? (
						<div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] grid-rows-2 items-center gap-x-1.5 gap-y-0.5">
							{isRenaming ? (
								<RenameInput
									value={renameValue}
									onChange={onRenameValueChange}
									onSubmit={onSubmitRename}
									onCancel={onCancelRename}
									className={cn(
										"h-5 w-full -ml-1 border-none bg-transparent px-1 py-0 text-[13px] leading-tight outline-none",
										!showBranchSubtitle && "row-span-2 self-center",
									)}
								/>
							) : (
								<span
									className={cn(
										"truncate text-[13px] leading-tight transition-colors",
										isActive
											? "text-foreground font-medium"
											: "text-foreground/80",
										!showBranchSubtitle && "row-span-2 self-center",
									)}
								>
									{name || branch}
								</span>
							)}

							<div className="col-start-2 row-start-1 grid h-5 shrink-0 items-center [&>*]:col-start-1 [&>*]:row-start-1">
								{creationStatusText ? (
									<span className="text-[11px] text-muted-foreground">
										{creationStatusText}
									</span>
								) : (
									<>
										<DashboardSidebarWorkspaceDiffStats
											additions={mockData.diffStats.additions}
											deletions={mockData.diffStats.deletions}
											isActive={isActive}
										/>
										<div className="invisible flex items-center justify-end gap-1.5 opacity-0 transition-[opacity,visibility] group-hover:visible group-hover:opacity-100">
											{shortcutLabel && (
												<span className="shrink-0 font-mono text-[10px] tabular-nums text-muted-foreground">
													{shortcutLabel}
												</span>
											)}
											<Tooltip delayDuration={300}>
												<TooltipTrigger asChild>
													<button
														type="button"
														onClick={(event) => {
															event.stopPropagation();
															onDeleteClick();
														}}
														className="flex items-center justify-center text-muted-foreground hover:text-foreground"
														aria-label="Close workspace"
													>
														<HiMiniXMark className="size-3.5" />
													</button>
												</TooltipTrigger>
												<TooltipContent side="top" sideOffset={4}>
													Close workspace
												</TooltipContent>
											</Tooltip>
										</div>
									</>
								)}
							</div>

							{showBranchSubtitle && (
								<span className="col-start-1 row-start-2 truncate font-mono text-[11px] leading-tight text-muted-foreground/60">
									{branch}
								</span>
							)}

							{pullRequest && (
								<DashboardSidebarWorkspaceStatusBadge
									state={pullRequest.state}
									prNumber={pullRequest.number}
									prUrl={pullRequest.url}
									className="col-start-2 row-start-2 justify-self-end"
								/>
							)}
						</div>
					) : (
						<div className="flex min-h-5 items-center gap-1.5">
							{isRenaming ? (
								<RenameInput
									value={renameValue}
									onChange={onRenameValueChange}
									onSubmit={onSubmitRename}
									onCancel={onCancelRename}
									className="h-5 w-full flex-1 -ml-1 border-none bg-transparent px-1 py-0 text-[13px] leading-tight outline-none"
								/>
							) : (
								<span
									className={cn(
										"truncate text-[13px] leading-tight transition-colors flex-1",
										isActive
											? "text-foreground font-medium"
											: "text-foreground/80",
									)}
								>
									{name || branch}
								</span>
							)}

							<div className="grid h-5 shrink-0 items-center [&>*]:col-start-1 [&>*]:row-start-1">
								{creationStatusText ? (
									<span className="text-[11px] text-muted-foreground">
										{creationStatusText}
									</span>
								) : (
									<>
										<DashboardSidebarWorkspaceDiffStats
											additions={mockData.diffStats.additions}
											deletions={mockData.diffStats.deletions}
											isActive={isActive}
										/>
										<div className="invisible flex items-center justify-end gap-1.5 opacity-0 transition-[opacity,visibility] group-hover:visible group-hover:opacity-100">
											{shortcutLabel && (
												<span className="shrink-0 font-mono text-[10px] tabular-nums text-muted-foreground">
													{shortcutLabel}
												</span>
											)}
											<Tooltip delayDuration={300}>
												<TooltipTrigger asChild>
													<button
														type="button"
														onClick={(event) => {
															event.stopPropagation();
															onDeleteClick();
														}}
														className="flex items-center justify-center text-muted-foreground hover:text-foreground"
														aria-label="Close workspace"
													>
														<HiMiniXMark className="size-3.5" />
													</button>
												</TooltipTrigger>
												<TooltipContent side="top" sideOffset={4}>
													Close workspace
												</TooltipContent>
											</Tooltip>
										</div>
									</>
								)}
							</div>
						</div>
					)}
				</div>
			</div>
		);
	},
);
