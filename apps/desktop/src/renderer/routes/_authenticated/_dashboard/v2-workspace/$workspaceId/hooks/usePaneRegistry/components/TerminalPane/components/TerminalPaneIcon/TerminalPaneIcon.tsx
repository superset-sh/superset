import { AGENT_IDENTITY_LABELS } from "@superset/shared/agent-catalog";
import { TerminalSquare } from "lucide-react";
import { usePresetIcon } from "renderer/assets/app-icons/preset-icons";
import { useTerminalAgentBinding } from "renderer/hooks/host-service/useTerminalAgentBindings";
import { resolveClaudeAgentColor } from "shared/constants/claude-agent-colors";

interface TerminalPaneIconProps {
	workspaceId: string;
	terminalId: string;
}

/**
 * Pane icon that swaps in the running agent's logo when the host-service
 * `terminalAgents` tracker has detected one in this terminal. Falls back
 * to the generic terminal glyph when no agent is bound or the agent id
 * has no preset icon. Adds a corner dot for the agent's own session color
 * (e.g. Claude Code's `/color`) when known.
 */
export function TerminalPaneIcon({
	workspaceId,
	terminalId,
}: TerminalPaneIconProps) {
	const binding = useTerminalAgentBinding(workspaceId, terminalId);
	const agentId = binding?.agentId;
	const iconSrc = usePresetIcon(agentId ?? "");
	const dotColor = resolveClaudeAgentColor(binding?.color);

	const colorDot = dotColor ? (
		<span
			className="-bottom-0.5 -right-0.5 absolute size-1.5 rounded-full ring-1 ring-background"
			style={{ backgroundColor: dotColor }}
			aria-hidden="true"
		/>
	) : null;

	if (agentId && iconSrc) {
		const label =
			(agentId in AGENT_IDENTITY_LABELS &&
				AGENT_IDENTITY_LABELS[agentId as keyof typeof AGENT_IDENTITY_LABELS]) ||
			agentId;
		return (
			<span className="relative inline-flex shrink-0">
				<img
					src={iconSrc}
					alt={label}
					title={label}
					className="size-3.5 shrink-0"
					draggable={false}
				/>
				{colorDot}
			</span>
		);
	}

	return (
		<span className="relative inline-flex shrink-0">
			<TerminalSquare className="size-3.5 shrink-0" />
			{colorDot}
		</span>
	);
}
