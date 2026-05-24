import type { CreatePaneInput, WorkspaceStore } from "@superset/panes";
import { toast } from "@superset/ui/sonner";
import { useLiveQuery } from "@tanstack/react-db";
import { useCallback, useMemo } from "react";
import { useV2AgentConfigs } from "renderer/hooks/useV2AgentConfigs";
import { resolvePresetLaunchCommands } from "renderer/lib/agent-launch-command";
import { useWorkspace } from "renderer/routes/_authenticated/_dashboard/v2-workspace/providers/WorkspaceProvider";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import type { V2TerminalPresetRow } from "renderer/routes/_authenticated/providers/CollectionsProvider/dashboardSidebarLocal";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";
import { getPresetLaunchPlan } from "renderer/stores/tabs/preset-launch";
import { filterMatchingPresetsForProject } from "shared/preset-project-targeting";
import type { StoreApi } from "zustand/vanilla";
import type { PaneViewerData, TerminalPaneData } from "../../types";
import type { TerminalLauncher } from "../useV2TerminalLauncher";

function makeTerminalPane(
	terminalId: string,
	titleOverride?: string,
): CreatePaneInput<PaneViewerData> {
	return {
		kind: "terminal",
		titleOverride,
		data: { terminalId } as TerminalPaneData,
	};
}

function resolveTarget(executionMode: V2TerminalPresetRow["executionMode"]) {
	return executionMode === "split-pane" ? "active-tab" : "new-tab";
}

interface UseV2PresetExecutionArgs {
	store: StoreApi<WorkspaceStore<PaneViewerData>>;
	launcher: TerminalLauncher;
}

export function useV2PresetExecution({
	store,
	launcher,
}: UseV2PresetExecutionArgs) {
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

	// Read v2 agent configs from the host service — same data source as the
	// /settings/agents page, so user edits there propagate here. The hook is
	// already invalidated by mutations in the agents settings page.
	const { activeHostUrl } = useLocalHostService();
	const { data: agents = [], refetch: refetchAgents } =
		useV2AgentConfigs(activeHostUrl);

	const matchedPresets = useMemo(
		() => filterMatchingPresetsForProject(allPresets, projectId),
		[allPresets, projectId],
	);

	// Keep the resolver synchronous for render-time consumers like
	// `useV2WorkspaceRun`. Direct preset execution does a one-shot refetch for
	// linked agents before launch so a recently edited agent cannot run from a
	// stale infinite-cache snapshot.
	const resolvePresetCommands = useCallback(
		(preset: V2TerminalPresetRow): string[] =>
			resolvePresetLaunchCommands(preset, agents),
		[agents],
	);

	const executePreset = useCallback(
		async (preset: V2TerminalPresetRow) => {
			const state = store.getState();
			const activeTabId = state.activeTabId;
			const target = resolveTarget(preset.executionMode);
			const title = preset.name || undefined;

			// Sessions for every pane this plan creates are spun up in parallel
			// before any of them land in the store, so background tabs (e.g.
			// new-tab-per-command, where each addTab flips activeTabId and only
			// the last tab ever mounts) still get their PTY + initial command —
			// host-service buffers PTY output until the user clicks the tab and
			// the pane finally mounts and attaches the WS.
			try {
				const liveAgents =
					preset.agentId && activeHostUrl
						? ((await refetchAgents()).data ?? agents)
						: agents;
				const commands = resolvePresetLaunchCommands(preset, liveAgents);

				const plan = getPresetLaunchPlan({
					mode: preset.executionMode,
					target,
					commandCount: commands.length,
					hasActiveTab: !!activeTabId,
				});

				switch (plan) {
					case "new-tab-single": {
						const terminalId = await launcher.create({ command: commands[0] });
						state.addTab({ panes: [makeTerminalPane(terminalId, title)] });
						break;
					}

					case "new-tab-multi-pane": {
						const ids = await Promise.all(
							commands.length > 0
								? commands.map((command) => launcher.create({ command }))
								: [launcher.create()],
						);
						state.addTab({
							panes: ids.map((id) => makeTerminalPane(id, title)) as [
								CreatePaneInput<PaneViewerData>,
								...CreatePaneInput<PaneViewerData>[],
							],
						});
						break;
					}

					case "new-tab-per-command": {
						const ids = await Promise.all(
							commands.map((command) => launcher.create({ command })),
						);
						for (const terminalId of ids) {
							state.addTab({ panes: [makeTerminalPane(terminalId, title)] });
						}
						break;
					}

					case "active-tab-single": {
						const terminalId = await launcher.create({ command: commands[0] });
						const pane = makeTerminalPane(terminalId, title);
						if (!activeTabId) {
							state.addTab({ panes: [pane] });
							break;
						}
						state.addPane({ tabId: activeTabId, pane });
						break;
					}

					case "active-tab-multi-pane": {
						const ids = await Promise.all(
							commands.length > 0
								? commands.map((command) => launcher.create({ command }))
								: [launcher.create()],
						);
						const panes = ids.map((id) => makeTerminalPane(id, title));
						if (!activeTabId) {
							state.addTab({
								panes: panes as [
									CreatePaneInput<PaneViewerData>,
									...CreatePaneInput<PaneViewerData>[],
								],
							});
							break;
						}
						for (const pane of panes) {
							state.addPane({ tabId: activeTabId, pane });
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
		[store, launcher, activeHostUrl, refetchAgents, agents],
	);

	return { matchedPresets, executePreset, resolvePresetCommands };
}
