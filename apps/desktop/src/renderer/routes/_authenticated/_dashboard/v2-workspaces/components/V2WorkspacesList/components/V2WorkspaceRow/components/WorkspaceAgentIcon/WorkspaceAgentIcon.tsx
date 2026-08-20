import { AGENT_IDENTITY_LABELS } from "@superset/shared/agent-catalog";
import { usePresetIcon } from "renderer/assets/app-icons/preset-icons";

interface WorkspaceAgentIconProps {
	agentId: string;
}

/** Logo of an agent that ran here — the "who's on this" marker. */
export function WorkspaceAgentIcon({ agentId }: WorkspaceAgentIconProps) {
	const iconSrc = usePresetIcon(agentId);
	if (!iconSrc) return null;
	const label =
		(agentId in AGENT_IDENTITY_LABELS &&
			AGENT_IDENTITY_LABELS[agentId as keyof typeof AGENT_IDENTITY_LABELS]) ||
		agentId;
	return (
		<img
			src={iconSrc}
			alt={label}
			title={label}
			className="size-3.5 shrink-0 rounded-[3px]"
			draggable={false}
		/>
	);
}
