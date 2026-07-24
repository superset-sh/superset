import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { cn } from "@superset/ui/utils";
import { motion, useAnimationControls, useIsPresent } from "framer-motion";
import { useEffect, useState } from "react";
import { HiMiniMinus, HiMiniXMark } from "react-icons/hi2";
import { DashboardSidebarWorkspaceDiffStats } from "renderer/routes/_authenticated/_dashboard/components/DashboardSidebar/components/DashboardSidebarWorkspaceItem/components/DashboardSidebarWorkspaceDiffStats";
import { DashboardSidebarWorkspaceIcon } from "renderer/routes/_authenticated/_dashboard/components/DashboardSidebar/components/DashboardSidebarWorkspaceItem/components/DashboardSidebarWorkspaceIcon";
import type { DashboardSidebarWorkspacePullRequest } from "renderer/routes/_authenticated/_dashboard/components/DashboardSidebar/types";
import { StatusIcon } from "renderer/routes/_authenticated/_dashboard/tasks/components/TasksView/components/shared/StatusIcon";
import { ProjectThumbnail } from "renderer/routes/_authenticated/components/ProjectThumbnail";
import {
	getStatusTooltip,
	StatusIndicator,
} from "renderer/screens/main/components/StatusIndicator";
import type { ActivePaneStatus } from "shared/tabs-types";
import { formatAge } from "../../model/formatAge";
import type { GroupBy, PrototypeWorkspace } from "../../model/types";
import { usePrototypeStore } from "../../store/usePrototypeStore";
import { PrototypeCloseDialog } from "../PrototypeCloseDialog/PrototypeCloseDialog";
import { PrototypeWorkspaceDetails } from "../PrototypeWorkspaceDetails/PrototypeWorkspaceDetails";

/** Same labels as the real expanded row's icon tooltip. */
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

interface PrototypeWorkspaceRowProps {
	workspace: PrototypeWorkspace;
	groupBy: GroupBy;
	now: number;
	isActive: boolean;
	shortcutLabel?: string;
	/**
	 * A monotonic value that changes when THIS row should flash (i.e. it was the
	 * workspace just mutated). 0 = never flashed. Changing it re-triggers.
	 */
	flashKey: number;
	/**
	 * Framer layout tween toggle. Disabled while a dnd-kit drag is active (and
	 * through the drop's commit render) so the two systems never animate the
	 * same move; sim-driven reorders keep it on.
	 */
	layoutEnabled?: boolean;
	onClick: () => void;
}

/**
 * Adaptive workspace row for the prototype. Composed from the REAL sidebar leaf
 * atoms (icon, status overlay, diff stats) so it matches Superset pixel-for-pixel,
 * then layers the view-system idea on top: it shows exactly the properties the
 * current grouping does NOT already imply. Uses framer-motion `layout` so the row
 * tweens to its new position when the list re-orders, plus a subtle landing flash.
 */
export function PrototypeWorkspaceRow({
	workspace,
	groupBy,
	now,
	isActive,
	shortcutLabel,
	flashKey,
	layoutEnabled = true,
	onClick,
}: PrototypeWorkspaceRowProps) {
	const flash = useAnimationControls();
	// While the row is exiting (travel to a collapsed group), it must stop
	// participating in LayoutGroup projection: React has already relocated its
	// DOM node to the new list position, and a layout FLIP tween there would
	// fight the travel transform (text drifting apart from its highlight).
	// Presence context still reaches exiting children even though their props
	// are frozen, so this — unlike a prop — flips in time.
	const isPresent = useIsPresent();
	const closeWorkspace = usePrototypeStore((s) => s.closeWorkspace);
	const [confirmOpen, setConfirmOpen] = useState(false);
	const isMainWorkspace = workspace.workspaceType === "main";

	// Highlight the moving card so the eye can lock onto it: ramp up to full
	// brightness near-instantly (the decelerating move tween covers most of its
	// distance in its first ~150ms, so a slow ramp would miss short hops), HOLD
	// bright while it travels, then fade slowly once it has landed.
	useEffect(() => {
		if (flashKey <= 0) return;
		flash.set({ opacity: 0 });
		flash.start({
			opacity: [0, 1, 1, 0],
			transition: {
				duration: 1.4,
				times: [0, 0.05, 0.5, 1],
				ease: "easeInOut",
			},
		});
	}, [flashKey, flash]);

	const activeStatus: ActivePaneStatus | null =
		workspace.agentStatus === "idle" ? null : workspace.agentStatus;

	// A card shows the properties the current grouping does not imply.
	const showRepo = groupBy !== "repository";
	const showLinear = groupBy !== "linear" && workspace.linearStatus !== null;

	return (
		<motion.div
			layout={layoutEnabled && isPresent}
			transition={{
				layout: { duration: 0.45, ease: [0.22, 1, 0.36, 1] },
			}}
			onClick={onClick}
			className={cn(
				// group/item scopes the ports strip's `details-expanded` hover state,
				// exactly like the real DashboardSidebarWorkspaceItem wrapper.
				"group group/item relative w-full cursor-pointer py-2 pr-2 pl-5 text-left",
				isActive ? "bg-accent" : "hover:bg-muted/50",
			)}
		>
			{/* Tracking highlight overlay (ramps up, holds through the move, fades).
			    Resting opacity lives in `style`, not `initial` — an enclosing
			    AnimatePresence initial={false} suppresses `initial` on first mount,
			    which would leave the overlay at full opacity (grey wash). */}
			<motion.span
				aria-hidden
				style={{ opacity: 0 }}
				animate={flash}
				className="pointer-events-none absolute inset-0 bg-foreground/25"
			/>

			{isActive && (
				<span
					className="absolute top-0 bottom-0 left-0 z-10 w-0.5 rounded-r"
					style={{ backgroundColor: "var(--color-foreground)" }}
				/>
			)}

			<div className="relative z-10 flex w-full items-center">
				{/* Icon cell copied from the real expanded row: size-5 + mr-2.5, so a
				    grouped row's title starts 10px deeper than its header label and
				    children read as children. `relative` anchors the status-dot
				    overlay (-top-0.5 -right-0.5) to the icon itself. The tooltip
				    mirrors the real row's icon tooltip — the glyph packs PR state,
				    workspace kind, and the agent dot into one small cluster, so
				    hover is where those colors get decoded. */}
				<Tooltip delayDuration={500}>
					<TooltipTrigger asChild>
						<span className="relative mr-2.5 flex size-5 shrink-0 items-center justify-center">
							{/* Desaturation experiment: the PR/kind glyph rests in
							    grayscale and regains color on row hover or selection.
							    The wrapper deliberately excludes the attention signals:
							    the working spinner (which replaces the glyph, hence the
							    !== "working" condition) and the status dot (re-rendered
							    below, outside the filter, at the icon component's own
							    overlay position). */}
							<span
								className={cn(
									"flex items-center justify-center transition-[filter] duration-150",
									!isActive &&
										activeStatus !== "working" &&
										"grayscale group-hover:grayscale-0",
								)}
							>
								<DashboardSidebarWorkspaceIcon
									hostType={workspace.hostType}
									workspaceType={workspace.workspaceType}
									hostIsOnline={workspace.hostIsOnline}
									isActive={isActive}
									variant="expanded"
									workspaceStatus={
										activeStatus === "working" ? "working" : null
									}
									isCreatePending={false}
									pullRequestState={workspace.pullRequest?.state ?? null}
								/>
							</span>
							{activeStatus && activeStatus !== "working" && (
								<span className="-top-0.5 -right-0.5 absolute">
									<StatusIndicator status={activeStatus} />
								</span>
							)}
						</span>
					</TooltipTrigger>
					<TooltipContent side="right" sideOffset={8}>
						{workspace.pullRequest ? (
							<>
								<p className="font-medium text-xs">
									PR #{workspace.pullRequest.number} —{" "}
									{PR_STATE_LABEL[workspace.pullRequest.state]}
								</p>
								<p className="max-w-56 truncate text-muted-foreground text-xs">
									{workspace.pullRequest.title}
								</p>
							</>
						) : (
							<>
								<p className="font-medium text-xs">
									{isMainWorkspace
										? "Main workspace"
										: workspace.hostType === "local-device"
											? "Local workspace"
											: workspace.hostType === "remote-device"
												? workspace.hostIsOnline === false
													? "Remote workspace — device offline"
													: "Remote workspace"
												: "Cloud workspace"}
								</p>
								<p className="text-muted-foreground text-xs">
									{isMainWorkspace
										? "Uses the repository checkout on this host"
										: workspace.hostType === "local-device"
											? "Running on this device"
											: workspace.hostType === "remote-device"
												? workspace.hostIsOnline === false
													? "The associated device isn't reachable right now"
													: "Running on a paired device"
												: "Hosted in the cloud"}
								</p>
							</>
						)}
						{activeStatus && (
							<p className="mt-1 text-muted-foreground text-xs">
								Agent: {getStatusTooltip(activeStatus)}
							</p>
						)}
					</TooltipContent>
				</Tooltip>

				<span className="flex min-w-0 flex-1 flex-col gap-0.5">
					{/* Title line copied from the real expanded row: a two-column grid
					    so the trailing cluster is vertically aligned with the TITLE
					    text, not centered against the whole multi-line row. */}
					<div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-1.5">
						<span
							className={cn(
								"truncate text-[13px] leading-tight",
								isActive ? "text-foreground" : "text-foreground/80",
							)}
						>
							{workspace.title}
						</span>
						{/* Same grid-overlap swap as the real row: age + diff stats at
						    rest, replaced wholesale by the ⌘N hint + close cluster on
						    hover. */}
						<div className="col-start-2 row-start-1 grid h-5 shrink-0 items-center justify-items-end [&>*]:col-start-1 [&>*]:row-start-1">
							<span className="flex items-center gap-2 group-hover:hidden">
								<span className="font-mono text-[10px] text-muted-foreground tabular-nums">
									{formatAge(now, workspace.lastActivityAt)}
								</span>
								<DashboardSidebarWorkspaceDiffStats
									additions={workspace.diff.additions}
									deletions={workspace.diff.deletions}
									isActive={isActive}
								/>
							</span>
							<div className="hidden items-center justify-end gap-1.5 group-hover:flex">
								{shortcutLabel && (
									<span className="shrink-0 font-mono text-[10px] text-muted-foreground tabular-nums">
										{shortcutLabel}
									</span>
								)}
								{isMainWorkspace ? (
									<Tooltip delayDuration={300}>
										<TooltipTrigger asChild>
											<button
												type="button"
												onClick={(event) => {
													event.stopPropagation();
													closeWorkspace(workspace.id);
												}}
												className="flex items-center justify-center text-muted-foreground hover:text-foreground"
												aria-label="Remove from sidebar"
											>
												<HiMiniMinus className="size-3.5" />
											</button>
										</TooltipTrigger>
										<TooltipContent side="top" sideOffset={4}>
											<p className="text-xs">Remove from sidebar</p>
										</TooltipContent>
									</Tooltip>
								) : (
									<Tooltip delayDuration={300}>
										<TooltipTrigger asChild>
											<button
												type="button"
												onClick={(event) => {
													event.stopPropagation();
													setConfirmOpen(true);
												}}
												className="flex items-center justify-center text-muted-foreground hover:text-foreground"
												aria-label="Close workspace"
											>
												<HiMiniXMark className="size-3.5" />
											</button>
										</TooltipTrigger>
										<TooltipContent side="top" sideOffset={4}>
											<p className="text-xs">Close workspace</p>
										</TooltipContent>
									</Tooltip>
								)}
							</div>
						</div>
					</div>
					{(showRepo || showLinear) && (
						<span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
							{showRepo && (
								<span className="flex items-center gap-1">
									<ProjectThumbnail
										projectName={workspace.repo.name}
										iconUrl={workspace.repo.iconUrl}
										className="size-3.5 rounded-[3px] text-[8px]"
									/>
									<span className="truncate">{workspace.repo.name}</span>
								</span>
							)}
							{showRepo && showLinear && (
								<span className="text-muted-foreground/40">·</span>
							)}
							{showLinear && workspace.linearStatus && (
								<span className="flex items-center gap-1">
									<StatusIcon
										type={workspace.linearStatus.iconType}
										color={workspace.linearStatus.color}
										progress={workspace.linearStatus.progress}
										// Same desaturation experiment as the PR glyph: color
										// returns on row hover/selection.
										className={cn(
											"scale-90 transition-[filter] duration-150",
											!isActive && "grayscale group-hover:grayscale-0",
										)}
									/>
									<span className="truncate">
										{workspace.linearStatus.label}
									</span>
								</span>
							)}
						</span>
					)}
				</span>
			</div>

			<PrototypeWorkspaceDetails workspace={workspace} onClick={onClick} />

			<PrototypeCloseDialog
				open={confirmOpen}
				onOpenChange={setConfirmOpen}
				workspaceName={workspace.title}
				onConfirm={() => {
					setConfirmOpen(false);
					closeWorkspace(workspace.id);
				}}
			/>
		</motion.div>
	);
}
