import { useLingui } from "@lingui/react/macro";
import { cn } from "@superset/ui/utils";
import { useNavigate } from "@tanstack/react-router";
import { navigateToV2Workspace } from "renderer/routes/_authenticated/_dashboard/utils/workspace-navigation";
import { getStatusTooltip } from "renderer/screens/main/components/StatusIndicator";
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
	const { t } = useLingui();
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
		agent.status === "idle"
			? t({ message: "Idle" })
			: getStatusTooltip(agent.status);

	return (
		<div className="flex items-center gap-1.5 rounded-sm px-2 py-1 hover:bg-muted">
			<button
				type="button"
				onClick={handleOpen}
				className="flex min-w-0 flex-1 items-center gap-1.5 text-left focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
			>
				<DashboardSidebarAgentAvatar agent={agent} />
				<span className="min-w-0 truncate text-xs">{agent.label}</span>
			</button>
			<span
				className={cn("shrink-0 text-[10px]", STATUS_TEXT_CLASS[agent.status])}
			>
				{statusLabel}
			</span>
		</div>
	);
}
