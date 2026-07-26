import { cn } from "@superset/ui/utils";
import { useNavigate } from "@tanstack/react-router";
import { LuX } from "react-icons/lu";
import { navigateToV2Workspace } from "renderer/routes/_authenticated/_dashboard/utils/workspace-navigation";
import { getStatusTooltip } from "renderer/screens/main/components/StatusIndicator";
import { STROKE_WIDTH } from "renderer/screens/main/components/WorkspaceSidebar/constants";
import { useDashboardSidebarAgentKill } from "../../../../hooks/useDashboardSidebarAgentKill";
import type {
	DashboardSidebarRunningAgent,
	RunningAgentStatus,
} from "../../../../hooks/useDashboardSidebarWorkspaceRunningAgents";
import { DashboardSidebarAgentAvatar } from "../DashboardSidebarAgentAvatar";

const STATUS_TEXT_CLASS: Record<RunningAgentStatus, string> = {
	idle: "text-muted-foreground",
	working: "text-amber-500",
	permission: "text-red-500",
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
	const { isPending, killAgent } = useDashboardSidebarAgentKill(workspaceId);

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

	return (
		<div className="group/row flex items-center gap-1.5 rounded-sm px-2 py-1 hover:bg-muted">
			<button
				type="button"
				onClick={handleOpen}
				className="flex min-w-0 flex-1 items-center gap-1.5 text-left focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
			>
				<DashboardSidebarAgentAvatar agent={agent} />
				<span className="min-w-0 truncate text-xs">{agent.label}</span>
			</button>
			{/* Status text and the × occupy one grid cell, swapped via visibility
			    so the row never changes size on hover. */}
			<span className="grid shrink-0 items-center justify-items-end [&>*]:col-start-1 [&>*]:row-start-1">
				<span
					className={cn(
						"text-[10px] group-focus-within/row:invisible group-hover/row:invisible",
						STATUS_TEXT_CLASS[agent.status],
					)}
				>
					{statusLabel}
				</span>
				<button
					type="button"
					onClick={() => {
						if (isPending) return;
						void killAgent(agent.terminalId);
					}}
					disabled={isPending}
					aria-label={`Stop ${agent.label}`}
					className="invisible flex size-5 items-center justify-center rounded text-muted-foreground hover:bg-destructive/10 hover:text-destructive focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring group-focus-within/row:visible group-hover/row:visible"
				>
					<LuX className="size-3" strokeWidth={STROKE_WIDTH} />
				</button>
			</span>
		</div>
	);
}
