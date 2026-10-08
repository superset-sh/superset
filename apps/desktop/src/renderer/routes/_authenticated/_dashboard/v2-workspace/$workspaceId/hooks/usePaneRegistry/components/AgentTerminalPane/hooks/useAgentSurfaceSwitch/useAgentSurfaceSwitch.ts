import { useLingui } from "@lingui/react/macro";
import { errorMessage } from "@superset/i18n/errors";
import type { CreatePaneInput, RendererContext } from "@superset/panes";
import { toast } from "@superset/ui/sonner";
import { workspaceTrpc } from "@superset/workspace-client";
import { useCallback, useMemo } from "react";
import { useTerminalAppearance } from "renderer/hooks/useTerminalAppearance";
import { terminalQueryColors } from "renderer/lib/terminal/terminal-query-colors";
import { terminalRuntimeRegistry } from "renderer/lib/terminal/terminal-runtime-registry";
import type {
	ChatPaneData,
	PaneViewerData,
	TerminalPaneData,
} from "../../../../../../types";
import { markChatSessionClosed } from "../../../../../../utils/closedChatSessions";
import { useChatWiring } from "../../../ChatSession/hooks/useSessionClient";

export type AgentSurface = "cli" | "acp";

export type AgentIdentity = { id: string; sessionId?: string };

export type AgentSurfaceSwitch = {
	/**
	 * Replaces an agent's terminal pane with its chat pane, or the reverse,
	 * stopping the process behind the one being left: two live processes on one
	 * session transcript would both be writing it.
	 */
	switchSurface(
		ctx: RendererContext<PaneViewerData>,
		surface: AgentSurface,
		agent: AgentIdentity | undefined,
	): Promise<void>;
	/** Resolves false when the adapter is still running. */
	stopChat(sessionId: string): Promise<boolean>;
};

export function useAgentSurfaceSwitch(workspaceId: string): AgentSurfaceSwitch {
	const { t } = useLingui();
	const wiring = useChatWiring();
	const killTerminal = workspaceTrpc.terminal.killSession.useMutation();
	const runAgent = workspaceTrpc.agents.run.useMutation();
	const appearance = useTerminalAppearance();

	const stopChat = useCallback(
		async (sessionId: string) => {
			const reopen = markChatSessionClosed(sessionId);
			try {
				await wiring.transport.closeSession({ sessionId });
				return true;
			} catch (error) {
				console.warn("[acp-chat] could not stop the chat session", error);
				reopen();
				return false;
			}
		},
		[wiring.transport],
	);

	const switchSurface = useCallback(
		async (
			ctx: RendererContext<PaneViewerData>,
			surface: AgentSurface,
			agent: AgentIdentity | undefined,
		) => {
			const replaceWith = (newPane: CreatePaneInput<PaneViewerData>) => {
				const state = ctx.store.getState();
				state.setPanePinned({ paneId: ctx.pane.id, pinned: false });
				state.replacePane({
					tabId: ctx.tab.id,
					paneId: ctx.pane.id,
					newPane: { ...newPane, pinned: ctx.pane.pinned },
				});
			};

			if (surface === "acp") {
				if (ctx.pane.kind !== "terminal" || !agent) return;
				const { terminalId } = ctx.pane.data as TerminalPaneData;
				terminalRuntimeRegistry.dispose(terminalId);
				try {
					await killTerminal.mutateAsync({ terminalId, workspaceId });
				} catch (error) {
					console.warn("[acp-chat] could not stop the terminal", error);
					toast.error(t({ message: "Couldn't stop the agent's terminal" }));
					return;
				}
				replaceWith({
					kind: "chat-v3",
					...(ctx.pane.titleOverride
						? { titleOverride: ctx.pane.titleOverride }
						: {}),
					data: {
						terminalId,
						sessionId: null,
						agent,
					} satisfies ChatPaneData,
				});
				return;
			}

			if (ctx.pane.kind !== "chat-v3") return;
			const data = ctx.pane.data as ChatPaneData;
			const resumeFrom = data.agent;
			if (!resumeFrom) return;

			if (data.sessionId && !(await stopChat(data.sessionId))) {
				toast.error(t({ message: "Couldn't stop the chat" }));
				return;
			}

			try {
				const result = await runAgent.mutateAsync({
					workspaceId,
					colors: terminalQueryColors(appearance.theme),
					agent: resumeFrom.id,
					prompt: "",
					...(resumeFrom.sessionId
						? { resumeSessionId: resumeFrom.sessionId }
						: {}),
				});
				if (result.kind !== "terminal") {
					toast.error(
						t({ message: "Couldn't reopen the agent in a terminal" }),
					);
					return;
				}
				replaceWith({
					kind: "terminal",
					titleOverride: result.label,
					data: { terminalId: result.sessionId } satisfies TerminalPaneData,
				});
			} catch (error) {
				toast.error(t({ message: "Couldn't reopen the agent in a terminal" }), {
					description: errorMessage(error, t({ message: "Unknown error" })),
				});
			}
		},
		[killTerminal, runAgent, stopChat, workspaceId, t, appearance.theme],
	);

	return useMemo(
		() => ({ switchSurface, stopChat }),
		[switchSurface, stopChat],
	);
}
