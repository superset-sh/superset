import type { CreatePaneInput, WorkspaceStore } from "@superset/panes";
import { toast } from "@superset/ui/sonner";
import { useLiveQuery } from "@tanstack/react-db";
import { useQuery } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";
import { electronTrpcClient } from "renderer/lib/trpc-client";
import { useWorkspace } from "renderer/routes/_authenticated/_dashboard/v2-workspace/providers/WorkspaceProvider";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import type { V2TerminalPresetRow } from "renderer/routes/_authenticated/providers/CollectionsProvider/dashboardSidebarLocal";
import { getPresetLaunchPlan } from "renderer/stores/tabs/preset-launch";
import { filterMatchingPresetsForProject } from "shared/preset-project-targeting";
import type { StoreApi } from "zustand/vanilla";
import type { PaneViewerData, TerminalPaneData } from "../../types";

function makeTerminalPane(
	terminalId: string,
	titleOverride?: string,
	initialCommand?: string,
): CreatePaneInput<PaneViewerData> {
	return {
		kind: "terminal",
		titleOverride,
		data: { terminalId, initialCommand } as TerminalPaneData,
	};
}

function resolveTarget(executionMode: V2TerminalPresetRow["executionMode"]) {
	return executionMode === "split-pane" ? "active-tab" : "new-tab";
}

interface UseV2PresetExecutionArgs {
	store: StoreApi<WorkspaceStore<PaneViewerData>>;
}

export function useV2PresetExecution({ store }: UseV2PresetExecutionArgs) {
	const { workspace } = useWorkspace();
	const projectId = workspace.projectId;
	const collections = useCollections();

	const { data: allPresets = [] } = useLiveQuery(
		(query) =>
			query
				.from({ v2TerminalPresets: collections.v2TerminalPresets })
				.orderBy(({ v2TerminalPresets }) => v2TerminalPresets.tabOrder),
		[collections],
	);

	// Use the vanilla electron client (not the React-hook electronTrpc) because
	// this hook runs inside WorkspaceTrpcProvider, which routes the React-hook
	// form to the workspace HTTP server (404 for the settings router).
	const { data: agents = [] } = useQuery({
		queryKey: ["v2-preset-execution", "agent-presets"],
		queryFn: () => electronTrpcClient.settings.getAgentPresets.query(),
		staleTime: 30_000,
	});

	const agentCommandsById = useMemo(() => {
		const map = new Map<string, string>();
		for (const agent of agents) {
			if (
				agent.kind === "terminal" &&
				agent.enabled &&
				agent.command.trim().length > 0
			) {
				map.set(agent.id, agent.command);
			}
		}
		return map;
	}, [agents]);

	const matchedPresets = useMemo(
		() => filterMatchingPresetsForProject(allPresets, projectId),
		[allPresets, projectId],
	);

	const resolvePresetCommands = useCallback(
		(preset: V2TerminalPresetRow): string[] => {
			if (!preset.agentId) return preset.commands;
			const live = agentCommandsById.get(preset.agentId);
			if (live) return [live];
			return preset.commands;
		},
		[agentCommandsById],
	);

	const executePreset = useCallback(
		(preset: V2TerminalPresetRow) => {
			const state = store.getState();
			const activeTabId = state.activeTabId;
			const target = resolveTarget(preset.executionMode);
			const commands = resolvePresetCommands(preset);

			const plan = getPresetLaunchPlan({
				mode: preset.executionMode,
				target,
				commandCount: commands.length,
				hasActiveTab: !!activeTabId,
			});

			try {
				switch (plan) {
					case "new-tab-single": {
						const id = crypto.randomUUID();
						state.addTab({
							panes: [
								makeTerminalPane(id, preset.name || undefined, commands[0]),
							],
						});
						break;
					}

					case "new-tab-multi-pane": {
						const panes = commands.map((command) =>
							makeTerminalPane(
								crypto.randomUUID(),
								preset.name || undefined,
								command,
							),
						);
						state.addTab({
							panes:
								panes.length > 0
									? (panes as [
											CreatePaneInput<PaneViewerData>,
											...CreatePaneInput<PaneViewerData>[],
										])
									: [
											makeTerminalPane(
												crypto.randomUUID(),
												preset.name || undefined,
											),
										],
						});
						break;
					}

					case "new-tab-per-command": {
						for (const command of commands) {
							state.addTab({
								panes: [
									makeTerminalPane(
										crypto.randomUUID(),
										preset.name || undefined,
										command,
									),
								],
							});
						}
						break;
					}

					case "active-tab-single": {
						const id = crypto.randomUUID();
						const pane = makeTerminalPane(
							id,
							preset.name || undefined,
							commands[0],
						);
						if (!activeTabId) {
							state.addTab({
								panes: [pane],
							});
							break;
						}
						state.addPane({
							tabId: activeTabId,
							pane,
						});
						break;
					}

					case "active-tab-multi-pane": {
						const panes = commands.map((command) =>
							makeTerminalPane(
								crypto.randomUUID(),
								preset.name || undefined,
								command,
							),
						);
						if (!activeTabId) {
							state.addTab({
								panes:
									panes.length > 0
										? (panes as [
												CreatePaneInput<PaneViewerData>,
												...CreatePaneInput<PaneViewerData>[],
											])
										: [
												makeTerminalPane(
													crypto.randomUUID(),
													preset.name || undefined,
												),
											],
							});
							break;
						}
						for (const pane of panes) {
							state.addPane({
								tabId: activeTabId,
								pane,
							});
						}
						break;
					}
				}
			} catch (err) {
				console.error("[useV2PresetExecution] Failed to execute preset:", err);
				toast.error("Failed to run preset", {
					description:
						err instanceof Error
							? err.message
							: "Terminal session creation failed.",
				});
			}
		},
		[store, resolvePresetCommands],
	);

	return { matchedPresets, executePreset };
}
