import { useTerminalAgentBinding } from "renderer/hooks/host-service/useTerminalAgentBindings";
import { useAcpChatEnabled } from "renderer/hooks/useAcpChatEnabled";
import { acpHarnessForPreset } from "renderer/lib/acpHarness";
import type { ChatPaneData, TerminalPaneData } from "../../../../../../types";
import type { AgentIdentity, AgentSurface } from "../useAgentSurfaceSwitch";

export type AgentPane =
	| { kind: "terminal"; data: TerminalPaneData }
	| { kind: "chat"; data: ChatPaneData };

export type ResolvedAgentSurface = {
	surface: AgentSurface;
	agent: AgentIdentity | undefined;
	switchable: boolean;
};

export function useAgentSurface(
	workspaceId: string,
	pane: AgentPane,
): ResolvedAgentSurface {
	const acpChat = useAcpChatEnabled();
	const binding = useTerminalAgentBinding(workspaceId, pane.data.terminalId);

	if (pane.kind === "chat") {
		return {
			surface: "acp",
			agent: pane.data.agent,
			switchable: Boolean(pane.data.agent),
		};
	}

	const harness = acpHarnessForPreset(binding?.agentId);
	const agent =
		harness && binding?.agentId && binding.agentSessionId && !binding.endedAt
			? { id: binding.agentId, sessionId: binding.agentSessionId }
			: undefined;
	return {
		surface: "cli",
		agent,
		switchable: acpChat === "enabled" && agent !== undefined,
	};
}
