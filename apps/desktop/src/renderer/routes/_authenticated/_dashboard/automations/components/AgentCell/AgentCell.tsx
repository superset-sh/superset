import { LuCpu } from "react-icons/lu";
import { usePresetIcon } from "renderer/assets/app-icons/preset-icons";
import { useHostUrl } from "renderer/hooks/host-service/useHostTargetUrl";
import { useV2AgentChoices } from "renderer/hooks/useV2AgentChoices";
import { getAutomationAgentDisplay } from "../../utils/agentDisplay";

export function AgentCell({
	agentId,
	hostId,
}: {
	agentId: string;
	hostId: string | null;
}) {
	const hostUrl = useHostUrl(hostId);
	const { agents } = useV2AgentChoices(hostUrl);
	const display = getAutomationAgentDisplay(agents, agentId);
	const icon = usePresetIcon(display.iconKey ?? "");

	return (
		<span className="inline-flex items-center gap-1.5">
			{icon ? (
				<img src={icon} alt="" className="size-3.5 shrink-0 object-contain" />
			) : (
				<LuCpu className="size-3.5 shrink-0" />
			)}
			<span className="truncate">{display.label}</span>
		</span>
	);
}
