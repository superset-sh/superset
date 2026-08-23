import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { cn } from "@superset/ui/utils";
import {
	type ComponentPropsWithoutRef,
	forwardRef,
	type KeyboardEventHandler,
	type MouseEventHandler,
	useEffect,
	useRef,
} from "react";
import {
	HiCheck,
	HiChevronRight,
	HiMiniMinus,
	HiMiniXMark,
} from "react-icons/hi2";
import type { DiffStats } from "renderer/hooks/host-service/useDiffStats";
import { HotkeyLabel } from "renderer/hotkeys";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { ProjectThumbnail } from "renderer/routes/_authenticated/components/ProjectThumbnail";
import { RenameInput } from "renderer/screens/main/components/WorkspaceSidebar/RenameInput";
import type { ActivePaneStatus } from "shared/tabs-types";
import type {
	DashboardSidebarWorkspace,
	DashboardSidebarWorkspacePullRequest,
} from "../../../../types";
import { DashboardSidebarWorkspaceDiffStats } from "../DashboardSidebarWorkspaceDiffStats";
import { DashboardSidebarWorkspaceIcon } from "../DashboardSidebarWorkspaceIcon";
import { DashboardSidebarWorkspaceChips } from "./components/DashboardSidebarWorkspaceChips";

const PR_STATE_LABEL: Record<
	DashboardSidebarWorkspacePullRequest["state"],
	string
> = {
	open: "Open",
	merged: "Merged",
	closed: "Closed",
	draft: "Draft",
	queued: "Queued",
};

interface DashboardSidebarExpandedWorkspaceRowProps
	extends ComponentPropsWithoutRef<"div"> {
	workspace: DashboardSidebarWorkspace;
	isActive: boolean;
	isRenaming: boolean;
	renameValue: string;
	shortcutLabel?: string;
	diffStats: DiffStats | null;
	workspaceStatus?: ActivePaneStatus | null;
	isInSection?: boolean;
	isBulkSelectable?: boolean;
	isSelected?: boolean;
	/** Present when rendered in the Pinned section: shows the project avatar. */
	/** projectName is null for pinned project-less "session" workspaces. */
	pinnedContext?: { projectName: string | null; projectIconUrl: string | null };
	onClick?: MouseEventHandler<HTMLDivElement>;
	onKeyboardActivate?: KeyboardEventHandler<HTMLDivElement>;
	onWorkspaceChipsClick?: MouseEventHandler<HTMLDivElement>;
	onDoubleClick?: () => void;
	onCloseWorkspaceClick: () => void;
	onToggleLineageCollapsed: () => void;
	onRemoveFromSidebarClick: () => void;
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
			diffStats,
			workspaceStatus = null,
			isInSection = false,
			isBulkSelectable = false,
			isSelected = false,
			pinnedContext,
			onClick,
			onKeyboardActivate,
			onWorkspaceChipsClick,
			onDoubleClick,
			onCloseWorkspaceClick,
			onToggleLineageCollapsed,
			onRemoveFromSidebarClick,
			onRenameValueChange,
			onSubmitRename,
			onCancelRename,
			className,
			...props
		},
		ref,
	) => {
		const {
			hostType,
			hostIsOnline,
			name,
			branch,
			pullRequest,
			pendingTransaction,
		} = workspace;
		const isPending = pendingTransaction?.type === "insert";
		const localRef = useRef<HTMLDivElement>(null);
		const openUrl = electronTrpc.external.openUrl.useMutation();
		const isLineageParent = workspace.lineageChildCount > 0;
		const handleLineageChevronClick: MouseEventHandler<HTMLButtonElement> = (
			event,
		) => {
			event.stopPropagation();
			onToggleLineageCollapsed();
		};

		useEffect(() => {
			if (isActive) {
				localRef.current?.scrollIntoView({
					block: "nearest",
					behavior: "smooth",
				});
			}
		}, [isActive]);

		const creationStatusText = isPending ? "Creating…" : null;
		const isMainWorkspace = workspace.type === "main";
		// No hover action button on the local main workspace: a stray click on the
		// minus would remove the project's anchor row. Removal stays available via
		// the context menu.
		const isLocalMainWorkspace = isMainWorkspace && hostType === "local-device";
		const workspaceKindTitle = isMainWorkspace
			? "Main workspace"
			: "Worktree workspace";
		const workspaceKindDescription = isMainWorkspace
			? "Uses the repository checkout on this host"
			: "Isolated copy for parallel development";

		return (
			<div
				ref={(node) => {
					localRef.current = node;
					if (typeof ref === "function") ref(node);
					else if (ref) ref.current = node;
				}}
				className={cn(
					"relative mx-2 rounded-md text-left text-sm transition-colors",
					isActive && "bg-fill-selected",
					isSelected && "bg-fill-selected",
					onClick &&
						(isSelected
							? "hover:bg-fill-selected"
							: isActive
								? "hover:bg-fill-selected"
								: "hover:bg-fill-hover"),
					className,
				)}
				data-selected={isSelected || undefined}
				{...props}
			>
				{/* Lineage guide rails: one thin vertical line per ancestor level,
				    aligned under that ancestor's icon column (file-tree styling).
				    Per-row segments join into continuous lines across siblings. */}
				{workspace.lineageDepth > 0 &&
					Array.from({ length: workspace.lineageDepth }, (_, level) => (
						<span
							// biome-ignore lint/suspicious/noArrayIndexKey: the index IS the identity — one rail per fixed ancestor level
							key={level}
							aria-hidden
							className="pointer-events-none absolute inset-y-0 w-px bg-border"
							style={{ left: (isInSection ? 32 : 12) + level * 16 + 9 }}
						/>
					))}
				{/* biome-ignore lint/a11y/useSemanticElements: The row contains nested action buttons, so it cannot be a native button. */}
				<div
					role="button"
					tabIndex={0}
					aria-disabled={isPending ? true : undefined}
					aria-pressed={isBulkSelectable ? isSelected : undefined}
					onClick={onClick}
					onKeyDown={(event) => {
						if (onClick && (event.key === "Enter" || event.key === " ")) {
							event.preventDefault();
							event.stopPropagation();
							onKeyboardActivate?.(event);
						}
					}}
					onDoubleClick={onDoubleClick}
					className={cn(
						"group relative flex w-full items-center py-1.5 pr-2",
						isInSection ? "pl-8" : "pl-3",
						onClick && "cursor-pointer",
					)}
					// Lineage indent: spawned children step in from their container's
					// base padding (pl-3 = 12px, pl-8 = 32px), one step per level.
					style={
						workspace.lineageDepth > 0
							? {
									paddingLeft:
										(isInSection ? 32 : 12) + workspace.lineageDepth * 16,
								}
							: undefined
					}
				>
					{isSelected ? (
						<span className="mr-2.5 flex size-5 shrink-0 items-center justify-center text-foreground">
							<HiCheck className="size-3.5" />
						</span>
					) : (
						<Tooltip delayDuration={500}>
							<TooltipTrigger asChild>
								{pullRequest ? (
									<button
										type="button"
										onClick={(event) => {
											event.stopPropagation();
											openUrl.mutate(pullRequest.url);
										}}
										onKeyDown={(event) => {
											if (event.key === "Enter" || event.key === " ") {
												event.stopPropagation();
											}
										}}
										aria-label={`Open pull request #${pullRequest.number}`}
										className="relative mr-2.5 flex size-5 shrink-0 cursor-pointer items-center justify-center rounded hover:bg-foreground/10"
									>
										<DashboardSidebarWorkspaceIcon
											hostType={hostType}
											workspaceType={workspace.type}
											hostIsOnline={hostIsOnline}
											isActive={isActive}
											variant="expanded"
											workspaceStatus={workspaceStatus}
											isCreatePending={isPending}
											pullRequestState={pullRequest.state}
										/>
									</button>
								) : (
									<div className="relative mr-2.5 flex size-5 shrink-0 items-center justify-center">
										{isLineageParent && !isPending ? (
											// Expanded: same affordance as the project header — the
											// status icon swaps to a collapse chevron on row hover.
											// Collapsed: the chevron is persistent (file-tree
											// closed-folder convention), so hidden children stay
											// discoverable at rest.
											<button
												type="button"
												aria-expanded={!workspace.lineageCollapsed}
												aria-label={
													workspace.lineageCollapsed
														? `Expand ${workspace.lineageChildCount} child workspaces`
														: "Collapse child workspaces"
												}
												onClick={handleLineageChevronClick}
												onKeyDown={(event) => {
													if (event.key === "Enter" || event.key === " ") {
														event.stopPropagation();
													}
												}}
												className="flex size-5 cursor-pointer items-center justify-center rounded hover:bg-foreground/10"
											>
												{!workspace.lineageCollapsed && (
													<span className="contents group-hover:hidden group-focus-within:hidden">
														<DashboardSidebarWorkspaceIcon
															hostType={hostType}
															workspaceType={workspace.type}
															hostIsOnline={hostIsOnline}
															isActive={isActive}
															variant="expanded"
															workspaceStatus={workspaceStatus}
															isCreatePending={isPending}
															pullRequestState={null}
														/>
													</span>
												)}
												<HiChevronRight
													className={cn(
														"size-4 text-muted-foreground transition-transform",
														workspace.lineageCollapsed
															? "block"
															: "hidden rotate-90 group-hover:block group-focus-within:block",
													)}
												/>
											</button>
										) : (
											<DashboardSidebarWorkspaceIcon
												hostType={hostType}
												workspaceType={workspace.type}
												hostIsOnline={hostIsOnline}
												isActive={isActive}
												variant="expanded"
												workspaceStatus={workspaceStatus}
												isCreatePending={isPending}
												pullRequestState={null}
											/>
										)}
									</div>
								)}
							</TooltipTrigger>
							<TooltipContent side="right" sideOffset={8}>
								{pullRequest ? (
									<>
										<p className="text-xs font-medium">
											PR #{pullRequest.number} —{" "}
											{PR_STATE_LABEL[pullRequest.state]}
										</p>
										<p className="text-xs text-muted-foreground">
											Click to open on GitHub
										</p>
									</>
								) : (
									<>
										<p className="text-xs font-medium">
											{isMainWorkspace
												? workspaceKindTitle
												: hostType === "local-device"
													? "Local workspace"
													: hostType === "remote-device"
														? hostIsOnline === false
															? "Remote workspace — device offline"
															: "Remote workspace"
														: "Cloud workspace"}
										</p>
										<p className="text-xs text-muted-foreground">
											{isMainWorkspace
												? workspaceKindDescription
												: hostType === "local-device"
													? "Running on this device"
													: hostType === "remote-device"
														? hostIsOnline === false
															? "The associated device isn't reachable right now"
															: "Running on a paired device"
														: "Hosted in the cloud"}
										</p>
									</>
								)}
							</TooltipContent>
						</Tooltip>
					)}

					{pinnedContext && (
						<Tooltip delayDuration={500}>
							<TooltipTrigger asChild>
								<div className="mr-1.5 flex shrink-0 items-center">
									<ProjectThumbnail
										projectName={pinnedContext.projectName ?? "Session"}
										iconUrl={pinnedContext.projectIconUrl}
										className="size-3.5 text-[8px]"
									/>
								</div>
							</TooltipTrigger>
							<TooltipContent side="right" sideOffset={8}>
								{pinnedContext.projectName ?? "Session"}
							</TooltipContent>
						</Tooltip>
					)}

					<div className="grid min-w-0 flex-1 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-1.5">
						{isRenaming ? (
							<RenameInput
								value={renameValue}
								onChange={onRenameValueChange}
								onSubmit={onSubmitRename}
								onCancel={onCancelRename}
								className={cn(
									"h-5 w-full -ml-1 border-none bg-transparent px-1 py-0 text-[13px] leading-tight outline-none",
								)}
							/>
						) : (
							<span
								className={cn(
									"truncate text-[13px] leading-tight transition-colors",
									isActive || isSelected
										? "text-foreground"
										: "text-foreground/80",
								)}
							>
								{name || branch}
								{isLineageParent && workspace.lineageCollapsed && (
									// aria-hidden: the chevron button already announces
									// "Expand N child workspaces" — this is its visual twin.
									<span
										aria-hidden
										className="ml-1.5 text-[10px] tabular-nums text-muted-foreground"
									>
										+{workspace.lineageChildCount}
									</span>
								)}
								{isSelected && <span className="sr-only">, selected</span>}
							</span>
						)}

						<div className="col-start-2 row-start-1 grid h-5 shrink-0 items-center justify-items-end [&>*]:col-start-1 [&>*]:row-start-1">
							{creationStatusText ? (
								<span className="text-[11px] text-muted-foreground">
									{creationStatusText}
								</span>
							) : (
								isActive &&
								diffStats &&
								(diffStats.additions > 0 || diffStats.deletions > 0) && (
									<DashboardSidebarWorkspaceDiffStats
										additions={diffStats.additions}
										deletions={diffStats.deletions}
										isActive={isActive}
									/>
								)
							)}
							{!isPending && !isSelected && (
								<div className="hidden items-center justify-end gap-1.5 group-hover:flex group-focus-within:flex">
									{shortcutLabel && (
										<span className="shrink-0 font-mono text-[10px] tabular-nums text-muted-foreground">
											{shortcutLabel}
										</span>
									)}
									{isLocalMainWorkspace ? null : isMainWorkspace ? (
										<Tooltip delayDuration={300}>
											<TooltipTrigger asChild>
												<button
													type="button"
													onClick={(event) => {
														event.stopPropagation();
														onRemoveFromSidebarClick();
													}}
													onKeyDown={(event) => {
														if (
															event.key === "Enter" ||
															event.key === " " ||
															event.key === "Spacebar"
														) {
															event.stopPropagation();
														}
													}}
													className="flex items-center justify-center text-muted-foreground hover:text-foreground"
													aria-label="Remove from sidebar"
												>
													<HiMiniMinus className="size-3.5" />
												</button>
											</TooltipTrigger>
											<TooltipContent side="top">
												<HotkeyLabel label="Remove from sidebar" />
											</TooltipContent>
										</Tooltip>
									) : (
										<Tooltip delayDuration={300}>
											<TooltipTrigger asChild>
												<button
													type="button"
													onClick={(event) => {
														event.stopPropagation();
														onCloseWorkspaceClick();
													}}
													onKeyDown={(event) => {
														if (
															event.key === "Enter" ||
															event.key === " " ||
															event.key === "Spacebar"
														) {
															event.stopPropagation();
														}
													}}
													className="flex items-center justify-center text-muted-foreground hover:text-foreground"
													aria-label="Close workspace"
												>
													<HiMiniXMark className="size-3.5" />
												</button>
											</TooltipTrigger>
											<TooltipContent side="top">
												<HotkeyLabel
													label="Close workspace"
													id={isActive ? "CLOSE_WORKSPACE" : undefined}
												/>
											</TooltipContent>
										</Tooltip>
									)}
								</div>
							)}
						</div>
					</div>
				</div>
				{!isPending && (
					<DashboardSidebarWorkspaceChips
						workspaceId={workspace.id}
						isInSection={isInSection}
						lineageDepth={workspace.lineageDepth}
						onClick={onWorkspaceChipsClick}
					/>
				)}
			</div>
		);
	},
);
