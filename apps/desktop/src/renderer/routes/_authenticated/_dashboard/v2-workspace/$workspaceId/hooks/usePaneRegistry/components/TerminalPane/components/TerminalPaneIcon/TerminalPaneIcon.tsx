import { BUILTIN_AGENT_LABELS } from "@superset/shared/agent-catalog";
import { TerminalSquare } from "lucide-react";
import { usePresetIcon } from "renderer/assets/app-icons/preset-icons";
import {
	selectV2AgentBinding,
	useV2AgentBindingStore,
} from "renderer/stores/v2-agent-bindings";

interface TerminalPaneIconProps {
	terminalId: string;
}

/**
 * Pane icon that swaps in the running agent's logo when the v2 lifecycle hook
 * has detected one in this terminal. Falls back to the generic terminal glyph
 * when no agent is bound or the agent id has no preset icon.
 */
export function TerminalPaneIcon({ terminalId }: TerminalPaneIconProps) {
	const binding = useV2AgentBindingStore(selectV2AgentBinding(terminalId));
	const agentId = binding?.identity.agentId;
	const iconSrc = usePresetIcon(agentId ?? "");

	if (agentId && iconSrc) {
		const label =
			(agentId in BUILTIN_AGENT_LABELS &&
				BUILTIN_AGENT_LABELS[agentId as keyof typeof BUILTIN_AGENT_LABELS]) ||
			agentId;
		return (
			<img
				src={iconSrc}
				alt={label}
				title={label}
				className="size-3.5 shrink-0"
				draggable={false}
			/>
		);
	}

	return <TerminalSquare className="size-3.5 shrink-0" />;
}
