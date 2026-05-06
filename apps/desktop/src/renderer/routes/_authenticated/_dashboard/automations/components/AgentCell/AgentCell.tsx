import { LuCpu } from "react-icons/lu";
import { usePresetIcon } from "renderer/assets/app-icons/preset-icons";

export function AgentCell({
	agentId,
	label,
}: {
	agentId: string;
	label: string;
}) {
	const icon = usePresetIcon(agentId);
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
