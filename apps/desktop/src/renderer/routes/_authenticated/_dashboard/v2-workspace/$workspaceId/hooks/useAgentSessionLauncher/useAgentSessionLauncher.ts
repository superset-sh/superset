import { useLingui } from "@lingui/react/macro";
import { errorMessage } from "@superset/i18n/errors";
import type { WorkspaceStore } from "@superset/panes";
import { FEATURE_FLAGS } from "@superset/shared/constants";
import { toast } from "@superset/ui/sonner";
import { useWorkspaceClient, workspaceTrpc } from "@superset/workspace-client";
import { useFeatureFlagEnabled } from "posthog-js/react";
import { useCallback } from "react";
import { useTerminalAppearance } from "renderer/hooks/useTerminalAppearance";
import { useV2AgentConfigs } from "renderer/hooks/useV2AgentConfigs";
import { terminalQueryColors } from "renderer/lib/terminal/terminal-query-colors";
import type { StoreApi } from "zustand/vanilla";
import type { PaneViewerData, TerminalPaneData } from "../../types";
import { focusOrAddTerminalPane } from "../../utils/focusTerminalPane";
import { acpHarnessForAgent } from "../usePaneRegistry/components/AgentTerminalPane/utils/acpHarness";

export interface CreateNewAgentSessionInput {
	configId: string;
	placement: "split-pane" | "new-tab";
	prompt: string;
	forkSessionId?: string;
}

export type CreateNewAgentSession = (
	input: CreateNewAgentSessionInput,
) => Promise<{ terminalId: string } | null>;

interface UseAgentSessionLauncherOptions {
	workspaceId: string;
	store: StoreApi<WorkspaceStore<PaneViewerData>>;
}

export function useAgentSessionLauncher({
	workspaceId,
	store,
}: UseAgentSessionLauncherOptions): {
	createNewAgentSession: CreateNewAgentSession;
	focusAgentTerminal: (terminalId: string) => void;
} {
	const { t } = useLingui();
	const runAgent = workspaceTrpc.agents.run.useMutation();
	const appearance = useTerminalAppearance();
	const acpEnabled = useFeatureFlagEnabled(FEATURE_FLAGS.ACP_CHAT) ?? false;
	const { hostUrl } = useWorkspaceClient();
	// The pty's launch reply is what normally names the pane; a chat has no
	// launch, so the agent's own label stands in.
	const { data: agentConfigs } = useV2AgentConfigs(hostUrl);

	const createNewAgentSession = useCallback<CreateNewAgentSession>(
		async (input) => {
			// A chat-capable agent opens straight onto its chat: starting a pty
			// first would run the agent once, derive onto the chat, kill it and
			// run it again. Forking a terminal session is still the terminal's
			// own flow, so it keeps the pty.
			if (
				acpEnabled &&
				!input.forkSessionId &&
				acpHarnessForAgent(input.configId)
			) {
				const state = store.getState();
				// No pty, so no host session id to key the pane on. Nothing is
				// registered against this one until the CLI surface launches a
				// terminal and replaces it.
				const terminalId = crypto.randomUUID();
				const label = agentConfigs?.find(
					(config) => config.id === input.configId,
				)?.label;
				const pane = {
					kind: "terminal" as const,
					...(label ? { titleOverride: label } : {}),
					data: {
						terminalId,
						agentSurface: "acp",
						agent: { id: input.configId },
						...(input.prompt ? { pendingPrompt: input.prompt } : {}),
					} as TerminalPaneData,
				};
				if (input.placement === "split-pane" && state.activeTabId) {
					state.addPane({ tabId: state.activeTabId, pane });
				} else {
					state.addTab({ panes: [pane] });
				}
				return { terminalId };
			}

			try {
				// Host pipeline bakes the prompt into the initialCommand using the
				// agent's argv/stdin transport — no follow-up writeInput needed,
				// no bind-wait race vs. the launching shell.
				const result = await runAgent.mutateAsync({
					workspaceId,
					colors: terminalQueryColors(appearance.theme),
					agent: input.configId,
					prompt: input.prompt,
					...(input.forkSessionId
						? { forkSessionId: input.forkSessionId }
						: {}),
				});
				if (result.kind !== "terminal") {
					toast.error(
						t({
							message: "Selected agent isn't a terminal agent",
						}),
					);
					return null;
				}
				const terminalId = result.sessionId;
				const state = store.getState();
				// No surface is stamped here: it is derived from the agent's binding
				// so every path that starts an agent — presets, hotkeys, the session
				// dropdown — opens on the same one.
				const pane = {
					kind: "terminal" as const,
					titleOverride: result.label,
					data: { terminalId } as TerminalPaneData,
				};
				if (input.placement === "split-pane" && state.activeTabId) {
					state.addPane({ tabId: state.activeTabId, pane });
				} else {
					state.addTab({ panes: [pane] });
				}
				return { terminalId };
			} catch (error) {
				const description = errorMessage(
					error,
					t({
						message: "Unknown error",
					}),
				);
				toast.error(
					t({
						message: "Couldn't start agent session",
					}),
					{ description },
				);
				return null;
			}
		},
		[
			runAgent,
			store,
			workspaceId,
			t,
			appearance.theme,
			acpEnabled,
			agentConfigs,
		],
	);

	const focusAgentTerminal = useCallback(
		(terminalId: string) => {
			focusOrAddTerminalPane(store, terminalId);
		},
		[store],
	);

	return { createNewAgentSession, focusAgentTerminal };
}
