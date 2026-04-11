import type { CreatePaneInput, WorkspaceStore } from "@superset/panes";
import { useLiveQuery } from "@tanstack/react-db";
import { useCallback, useMemo } from "react";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import type { V2TerminalPresetRow } from "renderer/routes/_authenticated/providers/CollectionsProvider/dashboardSidebarLocal";
import { getPresetLaunchPlan } from "renderer/stores/tabs/preset-launch";
import { filterMatchingPresetsForProject } from "shared/preset-project-targeting";
import type { StoreApi } from "zustand/vanilla";
import type { PaneViewerData, TerminalPaneData } from "../../types";

function makeTerminalPane(command?: string): CreatePaneInput<PaneViewerData> {
	return {
		kind: "terminal",
		data: {
			terminalId: crypto.randomUUID(),
			initialCommand: command,
		} as TerminalPaneData,
	};
}

function resolveTarget(executionMode: V2TerminalPresetRow["executionMode"]) {
	return executionMode === "split-pane" ? "active-tab" : "new-tab";
}

interface UseV2PresetExecutionArgs {
	store: StoreApi<WorkspaceStore<PaneViewerData>>;
	projectId: string;
}

export function useV2PresetExecution({
	store,
	projectId,
}: UseV2PresetExecutionArgs) {
	const collections = useCollections();

	const { data: allPresets = [] } = useLiveQuery(
		(query) =>
			query
				.from({ v2TerminalPresets: collections.v2TerminalPresets })
				.orderBy(({ v2TerminalPresets }) => v2TerminalPresets.tabOrder),
		[collections],
	);

	const matchedPresets = useMemo(
		() => filterMatchingPresetsForProject(allPresets, projectId),
		[allPresets, projectId],
	);

	const executePreset = useCallback(
		(preset: V2TerminalPresetRow) => {
			const state = store.getState();
			const activeTabId = state.activeTabId;
			const target = resolveTarget(preset.executionMode);

			const plan = getPresetLaunchPlan({
				mode: preset.executionMode,
				target,
				commandCount: preset.commands.length,
				hasActiveTab: !!activeTabId,
			});

			switch (plan) {
				case "new-tab-single": {
					state.addTab({
						titleOverride: preset.name || "Terminal",
						panes: [makeTerminalPane(preset.commands[0])],
					});
					break;
				}

				case "new-tab-multi-pane": {
					const panes = preset.commands.map((cmd) => makeTerminalPane(cmd));
					state.addTab({
						titleOverride: preset.name || "Terminal",
						panes:
							panes.length > 0
								? (panes as [
										CreatePaneInput<PaneViewerData>,
										...CreatePaneInput<PaneViewerData>[],
									])
								: [makeTerminalPane()],
					});
					break;
				}

				case "new-tab-per-command": {
					for (const command of preset.commands) {
						state.addTab({
							titleOverride: preset.name || "Terminal",
							panes: [makeTerminalPane(command)],
						});
					}
					break;
				}

				case "active-tab-single": {
					if (!activeTabId) {
						state.addTab({
							titleOverride: preset.name || "Terminal",
							panes: [makeTerminalPane(preset.commands[0])],
						});
						break;
					}
					state.addPane({
						tabId: activeTabId,
						pane: makeTerminalPane(preset.commands[0]),
					});
					break;
				}

				case "active-tab-multi-pane": {
					if (!activeTabId) {
						const panes = preset.commands.map((cmd) => makeTerminalPane(cmd));
						state.addTab({
							titleOverride: preset.name || "Terminal",
							panes:
								panes.length > 0
									? (panes as [
											CreatePaneInput<PaneViewerData>,
											...CreatePaneInput<PaneViewerData>[],
										])
									: [makeTerminalPane()],
						});
						break;
					}
					for (const command of preset.commands) {
						state.addPane({
							tabId: activeTabId,
							pane: makeTerminalPane(command),
						});
					}
					break;
				}
			}
		},
		[store],
	);

	return { matchedPresets, executePreset };
}
