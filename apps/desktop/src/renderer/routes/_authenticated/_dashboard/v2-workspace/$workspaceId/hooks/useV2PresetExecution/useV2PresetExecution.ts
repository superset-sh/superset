import type { CreatePaneInput, WorkspaceStore } from "@superset/panes";
import { toast } from "@superset/ui/sonner";
import { useLiveQuery } from "@tanstack/react-db";
import { useCallback, useMemo } from "react";
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
	workspaceId: string;
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

			try {
				switch (plan) {
					case "new-tab-single": {
						const id = crypto.randomUUID();
						state.addTab({
							panes: [
								makeTerminalPane(
									id,
									preset.name || undefined,
									preset.commands[0],
								),
							],
						});
						break;
					}

					case "new-tab-multi-pane": {
						const panes = preset.commands.map((command) =>
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
						for (const command of preset.commands) {
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
							preset.commands[0],
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
						const panes = preset.commands.map((command) =>
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
		[store],
	);

	return { matchedPresets, executePreset };
}
