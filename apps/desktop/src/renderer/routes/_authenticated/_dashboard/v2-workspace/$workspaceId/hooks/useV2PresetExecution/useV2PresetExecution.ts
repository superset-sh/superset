import type { CreatePaneInput, WorkspaceStore } from "@superset/panes";
import { toast } from "@superset/ui/sonner";
import { workspaceTrpc } from "@superset/workspace-client";
import { useLiveQuery } from "@tanstack/react-db";
import { useCallback, useMemo, useRef } from "react";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import type { V2TerminalPresetRow } from "renderer/routes/_authenticated/providers/CollectionsProvider/dashboardSidebarLocal";
import { getPresetLaunchPlan } from "renderer/stores/tabs/preset-launch";
import { filterMatchingPresetsForProject } from "shared/preset-project-targeting";
import type { StoreApi } from "zustand/vanilla";
import type { PaneViewerData, TerminalPaneData } from "../../types";

function makeTerminalPane(terminalId: string): CreatePaneInput<PaneViewerData> {
	return {
		kind: "terminal",
		data: { terminalId } as TerminalPaneData,
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
	workspaceId,
	projectId,
}: UseV2PresetExecutionArgs) {
	const collections = useCollections();
	const ensureSession = workspaceTrpc.terminal.ensureSession.useMutation();
	const ensureSessionRef = useRef(ensureSession);
	ensureSessionRef.current = ensureSession;

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

	/** Create a terminal session with a command on the host-service, return the terminalId. */
	const createSessionWithCommand = useCallback(
		async (command: string): Promise<string> => {
			const terminalId = crypto.randomUUID();
			await ensureSessionRef.current.mutateAsync({
				terminalId,
				workspaceId,
				initialCommand: command,
			});
			return terminalId;
		},
		[workspaceId],
	);

	const executePreset = useCallback(
		async (preset: V2TerminalPresetRow) => {
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
						const id = await createSessionWithCommand(
							preset.commands[0] as string,
						);
						state.addTab({
							titleOverride: preset.name || "Terminal",
							panes: [makeTerminalPane(id)],
						});
						break;
					}

					case "new-tab-multi-pane": {
						const ids = await Promise.all(
							preset.commands.map((cmd) => createSessionWithCommand(cmd)),
						);
						const panes = ids.map((id) => makeTerminalPane(id));
						state.addTab({
							titleOverride: preset.name || "Terminal",
							panes:
								panes.length > 0
									? (panes as [
											CreatePaneInput<PaneViewerData>,
											...CreatePaneInput<PaneViewerData>[],
										])
									: [makeTerminalPane(crypto.randomUUID())],
						});
						break;
					}

					case "new-tab-per-command": {
						const ids = await Promise.all(
							preset.commands.map((cmd) => createSessionWithCommand(cmd)),
						);
						for (let i = 0; i < ids.length; i++) {
							state.addTab({
								titleOverride: preset.name || "Terminal",
								panes: [makeTerminalPane(ids[i] as string)],
							});
						}
						break;
					}

					case "active-tab-single": {
						const id = await createSessionWithCommand(
							preset.commands[0] as string,
						);
						if (!activeTabId) {
							state.addTab({
								titleOverride: preset.name || "Terminal",
								panes: [makeTerminalPane(id)],
							});
							break;
						}
						state.addPane({
							tabId: activeTabId,
							pane: makeTerminalPane(id),
						});
						break;
					}

					case "active-tab-multi-pane": {
						const ids = await Promise.all(
							preset.commands.map((cmd) => createSessionWithCommand(cmd)),
						);
						if (!activeTabId) {
							const panes = ids.map((id) => makeTerminalPane(id));
							state.addTab({
								titleOverride: preset.name || "Terminal",
								panes:
									panes.length > 0
										? (panes as [
												CreatePaneInput<PaneViewerData>,
												...CreatePaneInput<PaneViewerData>[],
											])
										: [makeTerminalPane(crypto.randomUUID())],
							});
							break;
						}
						for (const id of ids) {
							state.addPane({
								tabId: activeTabId,
								pane: makeTerminalPane(id),
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
		[store, createSessionWithCommand],
	);

	return { matchedPresets, executePreset };
}
