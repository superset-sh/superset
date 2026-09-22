import { useLingui } from "@lingui/react/macro";
import { errorMessage } from "@superset/i18n/errors";
import type { WorkspaceStore } from "@superset/panes";
import { toast } from "@superset/ui/sonner";
import { workspaceTrpc } from "@superset/workspace-client";
import { TRPCClientError } from "@trpc/client";
import { useCallback } from "react";
import type { StoreApi } from "zustand/vanilla";
import type { PaneViewerData, TerminalPaneData } from "../../types";
import { focusOrAddTerminalPane } from "../../utils/focusTerminalPane";

export interface CreateNewAgentSessionInput {
	configId: string;
	placement: "split-pane" | "new-tab";
	prompt: string;
	forkSessionId?: string;
	forkSourceTerminalId?: string;
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

	const createNewAgentSession = useCallback<CreateNewAgentSession>(
		async (input) => {
			try {
				// Host pipeline bakes the prompt into the initialCommand using the
				// agent's argv/stdin transport — no follow-up writeInput needed,
				// no bind-wait race vs. the launching shell.
				const result = await runAgent.mutateAsync({
					workspaceId,
					agent: input.configId,
					prompt: input.prompt,
					...(input.forkSessionId
						? {
								forkSessionId: input.forkSessionId,
								forkSourceTerminalId: input.forkSourceTerminalId,
							}
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
				const description =
					input.forkSourceTerminalId &&
					error instanceof TRPCClientError &&
					error.data?.code === "CONFLICT"
						? t({
								message:
									"Could not verify the source session. Reopen it and try again.",
							})
						: errorMessage(
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
		[runAgent, store, workspaceId, t],
	);

	const focusAgentTerminal = useCallback(
		(terminalId: string) => {
			focusOrAddTerminalPane(store, terminalId);
		},
		[store],
	);

	return { createNewAgentSession, focusAgentTerminal };
}
