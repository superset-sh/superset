import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { cn } from "@superset/ui/utils";
import { useNavigate } from "@tanstack/react-router";
import { LuBot } from "react-icons/lu";
import { usePresetIcon } from "renderer/assets/app-icons/preset-icons";
import { navigateToV2Workspace } from "renderer/routes/_authenticated/_dashboard/utils/workspace-navigation";
import {
	getStatusTooltip,
	StatusIndicator,
} from "renderer/screens/main/components/StatusIndicator";
import { STROKE_WIDTH } from "renderer/screens/main/components/WorkspaceSidebar/constants";
import type { DashboardSidebarRunningAgent } from "../../hooks/useDashboardSidebarWorkspaceRunningAgents";

interface DashboardSidebarWorkspaceAgentBadgeProps {
	workspaceId: string;
	agent: DashboardSidebarRunningAgent;
}

export function DashboardSidebarWorkspaceAgentBadge({
	workspaceId,
	agent,
}: DashboardSidebarWorkspaceAgentBadgeProps) {
	const navigate = useNavigate();
	const iconUrl = usePresetIcon(agent.agentId);

	const handleClick = () => {
		void navigateToV2Workspace(workspaceId, navigate, {
			search: {
				terminalId: agent.terminalId,
				focusRequestId: crypto.randomUUID(),
			},
		});
	};

	const statusLabel =
		agent.status === "idle" ? "Idle" : getStatusTooltip(agent.status);

	return (
		<Tooltip delayDuration={700}>
			<TooltipTrigger asChild>
				<button
					type="button"
					onClick={handleClick}
					className={cn(
						"inline-flex max-w-40 shrink-0 items-center gap-1 rounded px-1.5 py-0.5",
						"bg-muted/60 text-[11px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
						"focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
					)}
				>
					<span className="flex size-3 shrink-0 items-center justify-center">
						{agent.status === "idle" ? (
							iconUrl ? (
								<img src={iconUrl} alt="" className="size-3 object-contain" />
							) : (
								<LuBot className="size-3" strokeWidth={STROKE_WIDTH} />
							)
						) : (
							<StatusIndicator status={agent.status} />
						)}
					</span>
					<span className="min-w-0 truncate">{agent.label}</span>
				</button>
			</TooltipTrigger>
			<TooltipContent side="top" sideOffset={6} showArrow={false}>
				<div className="space-y-1 text-xs">
					<div className="font-medium">{agent.label}</div>
					<div className="text-background/70">{statusLabel}</div>
					<div className="text-[10px] text-background/60">
						Click to open agent
					</div>
				</div>
			</TooltipContent>
		</Tooltip>
	);
}
