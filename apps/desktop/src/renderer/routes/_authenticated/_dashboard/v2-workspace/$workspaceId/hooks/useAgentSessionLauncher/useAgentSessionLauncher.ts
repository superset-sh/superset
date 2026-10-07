import { useLingui } from "@lingui/react/macro";
import { errorMessage } from "@superset/i18n/errors";
import type { WorkspaceStore } from "@superset/panes";
import { toast } from "@superset/ui/sonner";
import { useWorkspaceClient, workspaceTrpc } from "@superset/workspace-client";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { useAwaitAcpChatEnabled } from "renderer/hooks/useAcpChatEnabled";
import { useTerminalAppearance } from "renderer/hooks/useTerminalAppearance";
import {
	useV2AgentConfigs,
	v2AgentConfigsQueryOptions,
} from "renderer/hooks/useV2AgentConfigs";
import { acpHarnessForPreset } from "renderer/lib/acpHarness";
import { terminalQueryColors } from "renderer/lib/terminal/terminal-query-colors";
import type { StoreApi } from "zustand/vanilla";
import type {
	ChatPaneData,
	PaneViewerData,
	TerminalPaneData,
} from "../../types";
import { focusOrAddTerminalPane } from "../../utils/focusTerminalPane";

export interface CreateNewAgentSessionInput {
	configId: string;
	placement: "split-pane" | "new-tab";
	prompt: string;
	forkSessionId?: string;
	attachments?: Array<{ attachmentId: string; name: string; mimeType: string }>;
	modelId?: string;
	modeId?: string;
}

export type CreateNewAgentSession = (
	input: CreateNewAgentSessionInput,
) => Promise<{ terminalId: string } | null>;

export type OpenAgentChat = (
	input: Omit<CreateNewAgentSessionInput, "forkSessionId" | "prompt"> & {
		prompt?: string;
	},
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
	openAgentChat: OpenAgentChat;
	focusAgentTerminal: (terminalId: string) => void;
} {
	const { t } = useLingui();
	const runAgent = workspaceTrpc.agents.run.useMutation();
	const appearance = useTerminalAppearance();
	const awaitAcpChatEnabled = useAwaitAcpChatEnabled();
	const { hostUrl } = useWorkspaceClient();
	const { data: agentConfigs } = useV2AgentConfigs(hostUrl);
	const queryClient = useQueryClient();

	const openAgentChat = useCallback<OpenAgentChat>(
		async (input) => {
			if (!(await awaitAcpChatEnabled())) return null;
			const configs = await queryClient
				.ensureQueryData(v2AgentConfigsQueryOptions(hostUrl))
				.catch(() => agentConfigs ?? []);
			const config = configs.find((entry) => entry.id === input.configId);
			const presetId = config?.presetId;
			if (!presetId || !acpHarnessForPreset(presetId)) return null;
			const state = store.getState();
			const terminalId = crypto.randomUUID();
			const label = config?.label;
			const pane = {
				kind: "chat-v3" as const,
				...(label ? { titleOverride: label } : {}),
				data: {
					terminalId,
					sessionId: null,
					agent: { id: presetId },
					...(input.prompt ? { pendingPrompt: input.prompt } : {}),
					...(input.attachments?.length
						? { pendingAttachments: input.attachments }
						: {}),
					...(input.modelId ? { chatModelId: input.modelId } : {}),
					...(input.modeId ? { chatModeId: input.modeId } : {}),
				} satisfies ChatPaneData,
			};
			if (input.placement === "split-pane" && state.activeTabId) {
				state.addPane({ tabId: state.activeTabId, pane });
			} else {
				state.addTab({ panes: [pane] });
			}
			return { terminalId };
		},
		[awaitAcpChatEnabled, queryClient, hostUrl, agentConfigs, store],
	);

	const createNewAgentSession = useCallback<CreateNewAgentSession>(
		async (input) => {
			if (!input.forkSessionId) {
				const chat = await openAgentChat(input);
				if (chat) return chat;
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
					...(input.attachments?.length
						? {
								attachmentIds: input.attachments.map(
									(attachment) => attachment.attachmentId,
								),
							}
						: {}),
					...(input.modelId ? { model: input.modelId } : {}),
					...(input.modeId ? { mode: input.modeId } : {}),
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
		[runAgent, store, workspaceId, t, appearance.theme, openAgentChat],
	);

	const focusAgentTerminal = useCallback(
		(terminalId: string) => {
			focusOrAddTerminalPane(store, terminalId);
		},
		[store],
	);

	return { createNewAgentSession, openAgentChat, focusAgentTerminal };
}
