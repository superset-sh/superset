import { LuBot } from "react-icons/lu";
import { usePresetIcon } from "renderer/assets/app-icons/preset-icons";
import { STROKE_WIDTH } from "renderer/screens/main/components/WorkspaceSidebar/constants";

export function AgentTreeAgentIcon({ agentId }: { agentId: string }) {
	const iconUrl = usePresetIcon(agentId);
	return iconUrl ? (
		<img src={iconUrl} alt="" className="size-3 shrink-0 object-contain" />
	) : (
		<LuBot className="size-3 shrink-0" strokeWidth={STROKE_WIDTH} />
	);
}
