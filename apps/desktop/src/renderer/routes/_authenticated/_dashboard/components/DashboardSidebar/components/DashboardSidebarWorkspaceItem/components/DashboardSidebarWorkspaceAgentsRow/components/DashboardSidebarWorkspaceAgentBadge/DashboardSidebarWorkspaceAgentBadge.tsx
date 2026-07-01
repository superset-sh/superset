import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { cn } from "@superset/ui/utils";
import { useNavigate } from "@tanstack/react-router";
import { navigateToV2Workspace } from "renderer/routes/_authenticated/_dashboard/utils/workspace-navigation";
import {
	getStatusTooltip,
	StatusIndicator,
} from "renderer/screens/main/components/StatusIndicator";
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

	const handleClick = () => {
		const focusRequestId = crypto.randomUUID();
		const search =
			agent.source.type === "chat"
				? { chatSessionId: agent.source.id, focusRequestId }
				: agent.source.type === "terminal"
					? { terminalId: agent.source.id, focusRequestId }
					: { focusRequestId };
		void navigateToV2Workspace(workspaceId, navigate, { search });
	};

	return (
		<Tooltip delayDuration={700}>
			<TooltipTrigger asChild>
				<button
					type="button"
					onClick={handleClick}
					className={cn(
						"mb-1 inline-flex max-w-40 items-center gap-1.5 rounded-md px-2 py-1",
						"bg-primary/10 text-xs font-medium text-primary transition-colors hover:bg-primary/20",
						"focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
					)}
				>
					<StatusIndicator status={agent.status} />
					<span className="min-w-0 truncate">{agent.label}</span>
				</button>
			</TooltipTrigger>
			<TooltipContent side="top" sideOffset={6} showArrow={false}>
				<div className="space-y-1 text-xs">
					<div className="font-medium">{agent.label}</div>
					<div className="text-background/70">
						{getStatusTooltip(agent.status)}
					</div>
					<div className="text-[10px] text-background/60">
						Click to open agent
					</div>
				</div>
			</TooltipContent>
		</Tooltip>
	);
}
