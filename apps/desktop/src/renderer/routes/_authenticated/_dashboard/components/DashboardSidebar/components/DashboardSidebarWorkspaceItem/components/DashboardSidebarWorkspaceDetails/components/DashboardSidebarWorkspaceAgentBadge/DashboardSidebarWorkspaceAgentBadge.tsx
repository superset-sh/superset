import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuSeparator,
	ContextMenuTrigger,
} from "@superset/ui/context-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { cn } from "@superset/ui/utils";
import { useNavigate } from "@tanstack/react-router";
import { LuBot, LuSquareTerminal, LuTrash2 } from "react-icons/lu";
import { usePresetIcon } from "renderer/assets/app-icons/preset-icons";
import { navigateToV2Workspace } from "renderer/routes/_authenticated/_dashboard/utils/workspace-navigation";
import {
	getStatusTooltip,
	StatusIndicator,
} from "renderer/screens/main/components/StatusIndicator";
import { STROKE_WIDTH } from "renderer/screens/main/components/WorkspaceSidebar/constants";
import { useDashboardSidebarAgentKill } from "../../hooks/useDashboardSidebarAgentKill";
import type { DashboardSidebarRunningAgent } from "../../hooks/useDashboardSidebarWorkspaceRunningAgents";

interface DashboardSidebarWorkspaceAgentBadgeProps {
	workspaceId: string;
	agent: DashboardSidebarRunningAgent;
}

/**
 * One agent chip of the workspace activity strip. At rest it's a facepile
 * circle (icon + status dot) overlapping its neighbors; when the strip is
 * `details-expanded` it morphs into a labeled pill — the overlap margin and
 * the label's max-width animate, so the circle visibly grows into the pill
 * and retracts back. Clickable in both states; right-click opens a menu to
 * open or kill the agent.
 */
export function DashboardSidebarWorkspaceAgentBadge({
	workspaceId,
	agent,
}: DashboardSidebarWorkspaceAgentBadgeProps) {
	const navigate = useNavigate();
	const iconUrl = usePresetIcon(agent.agentId);
	const { isPending: isKilling, killAgent } =
		useDashboardSidebarAgentKill(workspaceId);

	const handleOpen = () => {
		void navigateToV2Workspace(workspaceId, navigate, {
			search: {
				terminalId: agent.terminalId,
				focusRequestId: crypto.randomUUID(),
			},
		});
	};

	const handleKill = () => {
		if (isKilling) return;
		void killAgent(agent.terminalId);
	};

	const statusLabel =
		agent.status === "idle" ? "Idle" : getStatusTooltip(agent.status);

	return (
		<ContextMenu>
			<Tooltip delayDuration={700}>
				<TooltipTrigger asChild>
					<ContextMenuTrigger asChild>
						<button
							type="button"
							onClick={handleOpen}
							aria-busy={isKilling}
							className={cn(
								"flex h-[18px] shrink-0 items-center rounded-full px-[3px]",
								"bg-muted text-[11px] text-muted-foreground",
								"-ml-1.5 first:ml-0",
								"transition-[margin,padding,color] duration-500 ease-out motion-reduce:transition-none",
								"details-expanded:ml-1 details-expanded:pl-1 details-expanded:pr-1.5 details-expanded:duration-200 details-expanded:first:ml-0",
								"hover:text-foreground",
								"focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
								isKilling && "opacity-70",
							)}
						>
							<span className="relative flex size-3 shrink-0 items-center justify-center">
								{iconUrl ? (
									<img src={iconUrl} alt="" className="size-3 object-contain" />
								) : (
									<LuBot className="size-3" strokeWidth={STROKE_WIDTH} />
								)}
								{agent.status !== "idle" && (
									<StatusIndicator
										status={agent.status}
										className="absolute -top-0.5 -right-0.5"
									/>
								)}
							</span>
							<span
								className={cn(
									"max-w-0 truncate opacity-0",
									"transition-[max-width,margin,opacity] duration-500 ease-out motion-reduce:transition-none",
									"details-expanded:ml-1 details-expanded:max-w-28 details-expanded:opacity-100 details-expanded:duration-200",
								)}
							>
								{agent.label}
							</span>
						</button>
					</ContextMenuTrigger>
				</TooltipTrigger>
				<TooltipContent side="top" sideOffset={6} showArrow={false}>
					<div className="space-y-1 text-xs">
						<div className="font-medium">{agent.label}</div>
						<div className="text-background/70">{statusLabel}</div>
						<div className="text-[10px] text-background/60">
							Click to open · right-click for actions
						</div>
					</div>
				</TooltipContent>
			</Tooltip>
			<ContextMenuContent onCloseAutoFocus={(event) => event.preventDefault()}>
				<ContextMenuItem onSelect={handleOpen}>
					<LuSquareTerminal />
					Open Agent
				</ContextMenuItem>
				<ContextMenuSeparator />
				<ContextMenuItem
					variant="destructive"
					onSelect={handleKill}
					disabled={isKilling}
				>
					<LuTrash2 />
					Kill Agent
				</ContextMenuItem>
			</ContextMenuContent>
		</ContextMenu>
	);
}
