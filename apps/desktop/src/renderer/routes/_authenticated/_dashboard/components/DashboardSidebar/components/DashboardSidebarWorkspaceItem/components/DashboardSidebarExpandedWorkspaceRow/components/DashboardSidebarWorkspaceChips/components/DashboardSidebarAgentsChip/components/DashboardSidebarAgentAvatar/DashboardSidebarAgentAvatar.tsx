import { cn } from "@superset/ui/utils";
import { LuBot } from "react-icons/lu";
import { usePresetIcon } from "renderer/assets/app-icons/preset-icons";
import { StatusIndicator } from "renderer/screens/main/components/StatusIndicator";
import { STROKE_WIDTH } from "renderer/screens/main/components/WorkspaceSidebar/constants";
import type { DashboardSidebarRunningAgent } from "../../../../hooks/useDashboardSidebarWorkspaceRunningAgents";

interface DashboardSidebarAgentAvatarProps {
	agent: DashboardSidebarRunningAgent;
	className?: string;
}

export function DashboardSidebarAgentAvatar({
	agent,
	className,
}: DashboardSidebarAgentAvatarProps) {
	const iconUrl = usePresetIcon(agent.agentId);

	return (
		<span
			className={cn(
				"relative flex size-3 shrink-0 items-center justify-center",
				className,
			)}
		>
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
	);
}
