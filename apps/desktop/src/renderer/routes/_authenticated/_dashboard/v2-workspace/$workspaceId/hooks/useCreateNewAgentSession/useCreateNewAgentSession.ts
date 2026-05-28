import type { WorkspaceStore } from "@superset/panes";
import { toast } from "@superset/ui/sonner";
import { workspaceTrpc } from "@superset/workspace-client";
import { useCallback } from "react";
import { useWorkspace } from "renderer/routes/_authenticated/_dashboard/v2-workspace/providers/WorkspaceProvider";
import type { StoreApi } from "zustand/vanilla";
import type { PaneViewerData, TerminalPaneData } from "../../types";

export interface CreateNewAgentSessionInput {
	configId: string;
	placement: "split-pane" | "new-tab";
	prompt: string;
}

export type CreateNewAgentSession = (
	input: CreateNewAgentSessionInput,
) => Promise<{ terminalId: string } | null>;

interface UseCreateNewAgentSessionArgs {
	store: StoreApi<WorkspaceStore<PaneViewerData>>;
}

/**
 * Launches a terminal-agent preset for the current workspace and seats the
 * resulting pane either next to the active tab (`split-pane`) or in a fresh
 * tab. Shared by:
 *   - `usePaneRegistry` (DiffPane comment composer "new session" handoff)
 *   - the v2 top-right PR action button (agent picker "Start new" entries)
 *
 * The host bakes the seed prompt into the agent's argv/stdin transport, so
 * no follow-up writeInput is needed and there's no bind-wait race.
 */
export function useCreateNewAgentSession({
	store,
}: UseCreateNewAgentSessionArgs): CreateNewAgentSession {
	const { workspace } = useWorkspace();
	const workspaceId = workspace.id;
	const runAgent = workspaceTrpc.agents.run.useMutation();

	return useCallback<CreateNewAgentSession>(
		async (input) => {
			try {
				const result = await runAgent.mutateAsync({
					workspaceId,
					agent: input.configId,
					prompt: input.prompt,
				});
				if (result.kind !== "terminal") {
					toast.error("Selected agent isn't a terminal agent");
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
					error instanceof Error ? error.message : "Unknown error";
				toast.error("Couldn't start agent session", { description });
				return null;
			}
		},
		[runAgent, store, workspaceId],
	);
}
