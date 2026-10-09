import { AGENT_IDENTITY_LABELS } from "@superset/shared/agent-catalog";
import { TerminalSquare } from "lucide-react";
import { usePresetIcon } from "renderer/assets/app-icons/preset-icons";
import { useTerminalAgentBinding } from "renderer/hooks/host-service/useTerminalAgentBindings";

interface TerminalPaneIconProps {
	workspaceId: string;
	terminalId: string;
	agentId?: string;
}

/**
 * Pane icon that shows the agent's logo: the pane's own `agentId` when it
 * has one (a chat pane), else the agent the host-service `terminalAgents`
 * tracker detected in this terminal. Falls back to the generic terminal
 * glyph when there is no agent or the agent id has no preset icon.
 */
export function TerminalPaneIcon({
	workspaceId,
	terminalId,
	agentId: paneAgentId,
}: TerminalPaneIconProps) {
	const binding = useTerminalAgentBinding(workspaceId, terminalId);
	const agentId = paneAgentId ?? binding?.agentId;
	const iconSrc = usePresetIcon(agentId ?? "");

	if (agentId && iconSrc) {
		const label =
			(agentId in AGENT_IDENTITY_LABELS &&
				AGENT_IDENTITY_LABELS[agentId as keyof typeof AGENT_IDENTITY_LABELS]) ||
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
