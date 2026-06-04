import type { CreatePaneInput, Pane, WorkspaceStore } from "@superset/panes";
import { toast } from "@superset/ui/sonner";
import { workspaceTrpc } from "@superset/workspace-client";
import { useLiveQuery } from "@tanstack/react-db";
import { useCallback, useMemo } from "react";
import { useV2AgentConfigs } from "renderer/hooks/useV2AgentConfigs";
import { resolvePresetLaunchCommands } from "renderer/lib/agent-launch-command";
import {
	buildTerminalCommand,
	normalizeTerminalCommand,
} from "renderer/lib/terminal/launch-command";
import { useWorkspace } from "renderer/routes/_authenticated/_dashboard/v2-workspace/providers/WorkspaceProvider";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import type { V2TerminalPresetRow } from "renderer/routes/_authenticated/providers/CollectionsProvider/dashboardSidebarLocal";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";
import { getPresetLaunchPlan } from "renderer/stores/tabs/preset-launch";
import { toAbsoluteWorkspacePath } from "shared/absolute-paths";
import {
	filterMatchingPresetsForProject,
	isProjectTargetedPreset,
} from "shared/preset-project-targeting";
import { quote } from "shell-quote";
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
	return executionMode === "split-pane" || executionMode === "sequential"
		? "active-tab"
		: "new-tab";
}

function normalizePresetCwd(cwd: string | undefined): string | undefined {
	const trimmed = cwd?.trim();
	return trimmed ? trimmed : undefined;
}

function isTerminalPane(
	pane: Pane<PaneViewerData> | null | undefined,
): pane is Pane<TerminalPaneData> {
	return pane?.kind === "terminal";
}

function getActiveTerminalPane(state: WorkspaceStore<PaneViewerData>) {
	const active = state.getActivePane();
	if (!active || !isTerminalPane(active.pane)) return null;
	return {
		tabId: active.tabId,
		paneId: active.pane.id,
		terminalId: active.pane.data.terminalId,
		titleOverride: active.pane.titleOverride,
	};
}

function buildFocusedTerminalCommand({
	command,
	cwd,
	worktreePath,
}: {
	command: string;
	cwd: string | undefined;
	worktreePath: string | undefined;
}) {
	// Sequential presets write into an already-running shell, so the preset
	// directory has to be applied as shell input instead of session metadata.
	if (!cwd) return command;
	const resolvedCwd = worktreePath
		? toAbsoluteWorkspacePath(worktreePath, cwd)
		: cwd;
	return `cd ${quote([resolvedCwd])} && ${command}`;
}

function selectAutoApplyPresets(
	presets: V2TerminalPresetRow[],
	field: "applyOnWorkspaceCreated" | "applyOnNewTab",
) {
	const targetedPresets = presets.filter(isProjectTargetedPreset);
	const globalPresets = presets.filter(
		(preset) => !isProjectTargetedPreset(preset),
	);

	const targetedTagged = targetedPresets.filter((preset) => preset[field]);
	if (targetedTagged.length > 0) {
		return targetedTagged;
	}

	return globalPresets.filter((preset) => preset[field]);
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
	const workspaceId = workspace.id;
	const projectId = workspace.projectId;
	const collections = useCollections();
	const workspaceQuery = workspaceTrpc.workspace.get.useQuery(
		{ id: workspaceId },
		{
			refetchOnWindowFocus: false,
			retry: false,
		},
	);
	const writeInput = workspaceTrpc.terminal.writeInput.useMutation();

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
	const { data: agents = [] } = useV2AgentConfigs(activeHostUrl);

	const matchedPresets = useMemo(
		() => filterMatchingPresetsForProject(allPresets, projectId),
		[allPresets, projectId],
	);
	const newTabPresets = useMemo(
		() => selectAutoApplyPresets(matchedPresets, "applyOnNewTab"),
		[matchedPresets],
	);

	// `useV2AgentConfigs` is the cached source of truth for agent configs
	// (`staleTime: Infinity`, invalidated on every Settings → Agents mutation),
	// so resolving against the in-memory `agents` array is correct and
	// synchronous. Re-fetching via the host-service client on every call would
	// duplicate that query and pin this function async, which forced the
	// previous consumer (`useV2WorkspaceRun`) into a re-render cycle.
	const resolvePresetCommands = useCallback(
		(preset: V2TerminalPresetRow): string[] =>
			resolvePresetLaunchCommands(preset, agents),
		[agents],
	);

	const executePreset = useCallback(
		async (
			preset: V2TerminalPresetRow,
			options?: { target?: "new-tab" | "active-tab" },
		) => {
			const state = store.getState();
			const activeTabId = state.activeTabId;
			const target = options?.target ?? resolveTarget(preset.executionMode);
			const title = preset.name || undefined;
			const commands = resolvePresetCommands(preset);
			const activeTerminal =
				target === "active-tab" && preset.executionMode === "sequential"
					? getActiveTerminalPane(state)
					: null;
			// Sequential mode is one shell command sent to one terminal; every
			// other grouped mode keeps one command per terminal session.
			const launchCommands =
				preset.executionMode === "sequential"
					? [buildTerminalCommand(commands)].flatMap((command) =>
							command === null ? [] : [command],
						)
					: commands;
			const cwd = normalizePresetCwd(preset.cwd);
			const createTerminal = (command?: string) =>
				launcher.create({ command, cwd });

			const plan = getPresetLaunchPlan({
				mode: preset.executionMode,
				target,
				commandCount: launchCommands.length,
				hasActiveTab: !!activeTabId,
				hasActiveTerminal: !!activeTerminal,
			});

			// Sessions for every pane this plan creates are spun up in parallel
			// before any of them land in the store, so background tabs (e.g.
			// new-tab-per-command, where each addTab flips activeTabId and only
			// the last tab ever mounts) still get their PTY + initial command —
			// host-service buffers PTY output until the user clicks the tab and
			// the pane finally mounts and attaches the WS.
			try {
				switch (plan) {
					case "active-terminal": {
						const command = launchCommands[0];
						if (!activeTerminal || !command) break;
						await writeInput.mutateAsync({
							terminalId: activeTerminal.terminalId,
							workspaceId,
							data: normalizeTerminalCommand(
								buildFocusedTerminalCommand({
									command,
									cwd,
									worktreePath: workspaceQuery.data?.worktreePath,
								}),
							),
						});
						if (title && !activeTerminal.titleOverride?.trim()) {
							// Reused terminals keep their existing pane, so apply the
							// first preset label explicitly instead of relying on creation
							// metadata. Once a pane has a label, later preset runs must not
							// rename it.
							state.setPaneTitleOverride({
								tabId: activeTerminal.tabId,
								paneId: activeTerminal.paneId,
								titleOverride: title,
							});
						}
						break;
					}

					case "new-tab-single": {
						const terminalId = await createTerminal(launchCommands[0]);
						state.addTab({ panes: [makeTerminalPane(terminalId, title)] });
						break;
					}

					case "new-tab-multi-pane": {
						const ids = await Promise.all(
							launchCommands.length > 0
								? launchCommands.map((command) => createTerminal(command))
								: [createTerminal()],
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
							launchCommands.map((command) => createTerminal(command)),
						);
						for (const terminalId of ids) {
							state.addTab({ panes: [makeTerminalPane(terminalId, title)] });
						}
						break;
					}

					case "active-tab-single": {
						const terminalId = await createTerminal(launchCommands[0]);
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
							launchCommands.length > 0
								? launchCommands.map((command) => createTerminal(command))
								: [createTerminal()],
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
		[
			store,
			launcher,
			resolvePresetCommands,
			workspaceId,
			workspaceQuery.data?.worktreePath,
			writeInput,
		],
	);

	return {
		matchedPresets,
		newTabPresets,
		executePreset,
		resolvePresetCommands,
	};
}
