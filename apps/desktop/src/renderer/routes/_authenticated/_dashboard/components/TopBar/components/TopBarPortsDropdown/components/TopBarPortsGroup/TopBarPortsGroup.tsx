import { plural } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@superset/ui/collapsible";
import { toast } from "@superset/ui/sonner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { cn } from "@superset/ui/utils";
import { useNavigate } from "@tanstack/react-router";
import { LuChevronRight, LuLoaderCircle, LuX } from "react-icons/lu";
import { useDashboardSidebarPortKill } from "renderer/routes/_authenticated/_dashboard/components/DashboardSidebar/hooks/useDashboardSidebarPortKill";
import type { DashboardSidebarPortGroup } from "renderer/routes/_authenticated/_dashboard/components/DashboardSidebar/hooks/useDashboardSidebarPortsData";
import { navigateToV2Workspace } from "renderer/routes/_authenticated/_dashboard/utils/workspace-navigation";
import { STROKE_WIDTH } from "renderer/screens/main/components/WorkspaceSidebar/constants";
import { usePortsStore } from "renderer/stores/ports";
import { TopBarPortRow } from "../TopBarPortRow";

interface TopBarPortsGroupProps {
	group: DashboardSidebarPortGroup;
	onNavigate: () => void;
}

/**
 * One workspace's ports in the top-bar dropdown: a collapsible header that
 * navigates to the workspace (with a hover-revealed close-all for the
 * group), then a row per port. Collapse state is keyed per workspace and
 * persists across sessions via `usePortsStore`.
 */
export function TopBarPortsGroup({ group, onNavigate }: TopBarPortsGroupProps) {
	const { t } = useLingui();
	const navigate = useNavigate();
	const { isPending, killPorts } = useDashboardSidebarPortKill();
	const isCollapsed = usePortsStore(
		(s) => !!s.collapsedWorkspaceIds[group.workspaceId],
	);
	const toggleCollapsed = usePortsStore((s) => s.toggleWorkspaceCollapsed);

	const handleWorkspaceClick = () => {
		void navigateToV2Workspace(group.workspaceId, navigate);
		onNavigate();
	};

	const handleCloseAll = async () => {
		if (isPending) return;
		const results = await killPorts(group.ports);
		const closedCount = results.filter((result) => result.success).length;
		if (closedCount > 0) {
			toast.success(
				t({
					message: plural(closedCount, {
						one: "Closed # port",
						other: "Closed # ports",
					}),
				}),
			);
		}
	};

	return (
		<Collapsible
			open={!isCollapsed}
			onOpenChange={() => toggleCollapsed(group.workspaceId)}
			className="border-border/60 border-t pb-1 first:border-t-0 first:pt-0"
		>
			<div className="group/wsheader flex items-center gap-1 px-1 pt-1.5 pb-0.5">
				<CollapsibleTrigger asChild>
					<button
						type="button"
						aria-label={
							isCollapsed
								? t({
										message: `Expand ${group.workspaceName}`,
									})
								: t({
										message: `Collapse ${group.workspaceName}`,
									})
						}
						className="shrink-0 rounded p-0.5 text-muted-foreground/70 transition-colors hover:bg-fill-hover hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
					>
						<LuChevronRight
							className={cn(
								"size-3 transition-transform duration-150",
								!isCollapsed && "rotate-90",
							)}
							strokeWidth={STROKE_WIDTH}
						/>
					</button>
				</CollapsibleTrigger>
				<button
					type="button"
					onClick={handleWorkspaceClick}
					className="truncate font-medium text-[11px] text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:text-foreground"
				>
					{group.workspaceName}
				</button>
				{group.hostType !== "local-device" && (
					<span className="shrink-0 font-mono text-[9px] text-muted-foreground/60 uppercase">
						<Trans>remote</Trans>
					</span>
				)}
				<span className="shrink-0 text-[10px] text-muted-foreground/50 tabular-nums">
					{group.ports.length}
				</span>
				<Tooltip delayDuration={300}>
					<TooltipTrigger asChild>
						<button
							type="button"
							onClick={() => void handleCloseAll()}
							disabled={isPending}
							aria-busy={isPending}
							aria-label={t({
								message: `Close all ports for ${group.workspaceName}`,
							})}
							className="ml-auto shrink-0 rounded p-0.5 text-muted-foreground opacity-0 transition-opacity hover:bg-destructive/10 hover:text-destructive focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring group-hover/wsheader:opacity-100 disabled:pointer-events-none disabled:opacity-60"
						>
							{isPending ? (
								<LuLoaderCircle
									className="size-3 animate-spin"
									strokeWidth={STROKE_WIDTH}
								/>
							) : (
								<LuX className="size-3" strokeWidth={STROKE_WIDTH} />
							)}
						</button>
					</TooltipTrigger>
					<TooltipContent side="top">
						<p className="text-xs">
							<Trans>Close all ports in this workspace</Trans>
						</p>
					</TooltipContent>
				</Tooltip>
			</div>
			<CollapsibleContent className="overflow-hidden data-[state=closed]:animate-collapsible-up data-[state=open]:animate-collapsible-down">
				<div className="pl-3">
					{group.ports.map((port) => (
						<TopBarPortRow
							key={`${port.hostId}:${port.terminalId}:${port.port}`}
							port={port}
							onNavigate={onNavigate}
						/>
					))}
				</div>
			</CollapsibleContent>
		</Collapsible>
	);
}
