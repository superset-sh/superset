import { getPresetById } from "@superset/shared/host-agent-presets";
import { LuCpu } from "react-icons/lu";
import { usePresetIcon } from "renderer/assets/app-icons/preset-icons";
import { useHostUrl } from "renderer/hooks/host-service/useHostTargetUrl";
import { useV2AgentChoices } from "renderer/hooks/useV2AgentChoices";

export function AgentCell({
	agentId,
	hostId,
}: {
	agentId: string;
	hostId: string | null;
}) {
	const hostUrl = useHostUrl(hostId);
	const { agents } = useV2AgentChoices(hostUrl);
	const hostMatch = agents.find((option) => option.id === agentId);
	const presetMatch = hostMatch ? null : getPresetById(agentId);
	const label = hostMatch?.label ?? presetMatch?.label ?? agentId;
	const iconKey = hostMatch?.iconId ?? presetMatch?.presetId ?? agentId;
	const icon = usePresetIcon(iconKey);

	return (
		<span className="inline-flex items-center gap-1.5">
			{icon ? (
				<img src={icon} alt="" className="size-3.5 shrink-0 object-contain" />
			) : (
				<LuCpu className="size-3.5 shrink-0" />
			)}
			<span className="truncate">{label}</span>
		</span>
	);
}
