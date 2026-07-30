import { cn } from "@superset/ui/utils";
import { useNavigate } from "@tanstack/react-router";
import { navigateToV2Workspace } from "renderer/routes/_authenticated/_dashboard/utils/workspace-navigation";
import { getStatusTooltip } from "renderer/screens/main/components/StatusIndicator";
import { resolveClaudeAgentColor } from "shared/constants/claude-agent-colors";
import type {
	DashboardSidebarRunningAgent,
	RunningAgentStatus,
} from "../../../../hooks/useDashboardSidebarWorkspaceRunningAgents";
import { DashboardSidebarAgentAvatar } from "../DashboardSidebarAgentAvatar";

const STATUS_TEXT_CLASS: Record<RunningAgentStatus, string> = {
	idle: "text-muted-foreground",
	working: "text-amber-500",
	permission: "text-yellow-500",
	failed: "text-red-500",
	review: "text-green-500",
};

interface DashboardSidebarAgentHoverRowProps {
	workspaceId: string;
	agent: DashboardSidebarRunningAgent;
}

export function DashboardSidebarAgentHoverRow({
	workspaceId,
	agent,
}: DashboardSidebarAgentHoverRowProps) {
	const navigate = useNavigate();

	const handleOpen = () => {
		void navigateToV2Workspace(workspaceId, navigate, {
			search: {
				terminalId: agent.terminalId,
				focusRequestId: crypto.randomUUID(),
			},
		});
	};

	const statusLabel =
		agent.status === "idle" ? "Idle" : getStatusTooltip(agent.status);
	const displayLabel = agent.title ?? agent.label;
	const dotColor = resolveClaudeAgentColor(agent.color);

	return (
		<div className="flex items-center gap-1.5 rounded-sm px-2 py-1 hover:bg-muted">
			<button
				type="button"
				onClick={handleOpen}
				className="flex min-w-0 flex-1 items-center gap-1.5 text-left focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
			>
				<DashboardSidebarAgentAvatar agent={agent} />
				{dotColor ? (
					<span
						className="size-1.5 shrink-0 rounded-full"
						style={{ backgroundColor: dotColor }}
						aria-hidden="true"
					/>
				) : null}
				<span className="min-w-0 truncate text-xs">{displayLabel}</span>
			</button>
			<span
				className={cn("shrink-0 text-[10px]", STATUS_TEXT_CLASS[agent.status])}
			>
				{statusLabel}
			</span>
		</div>
	);
}
