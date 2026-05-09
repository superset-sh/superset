import {
	type ExecutionMode,
	normalizeExecutionMode,
	type TerminalPreset,
} from "@superset/local-db";
import { HOST_AGENT_PRESETS } from "@superset/shared/host-agent-presets";
import { Button } from "@superset/ui/button";
import { useLiveQuery } from "@tanstack/react-db";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { HiOutlinePlus } from "react-icons/hi2";
import { useIsDarkTheme } from "renderer/assets/app-icons/preset-icons";
import { useV2AgentConfigs } from "renderer/hooks/useV2AgentConfigs";
import { buildAgentLaunchCommand } from "renderer/lib/agent-launch-command";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import type { V2TerminalPresetRow } from "renderer/routes/_authenticated/providers/CollectionsProvider/dashboardSidebarLocal";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";
import type { PresetColumnKey } from "renderer/routes/_authenticated/settings/presets/types";
import { PresetEditorDialog } from "../PresetsSection/components/PresetEditorDialog";

import { PresetsTable } from "../PresetsSection/components/PresetsTable";
import {
	type QuickAddAgentPill,
	QuickAddPresets,
} from "../PresetsSection/components/QuickAddPresets";
import type { AutoApplyField } from "../PresetsSection/constants";
import type { PresetProjectOption } from "../PresetsSection/preset-project-options";

const DESCRIPTION_BY_PRESET_ID = new Map<string, string>(
	HOST_AGENT_PRESETS.map((preset) => [preset.presetId, preset.description]),
);

interface V2PresetsSectionProps {
	showPresets: boolean;
	showQuickAdd: boolean;
	editingPresetId?: string | null;
	onEditingPresetIdChange?: (presetId: string | null) => void;
	pendingCreateProjectId?: string | null;
	onPendingCreateProjectIdChange?: (projectId: string | null) => void;
}

/**
 * V2 clone of PresetsSection wired to the renderer-side v2TerminalPresets
 * collection. Reuses PresetsTable / PresetEditorDialog / QuickAddPresets from
 * the v1 directory (they're prop-driven renderers). When v1 is deprecated,
 * delete PresetsSection and move the shared sub-components here.
 */
export function V2PresetsSection({
	showPresets,
	showQuickAdd,
	editingPresetId: editingPresetIdFromRoute,
	onEditingPresetIdChange,
	pendingCreateProjectId,
	onPendingCreateProjectIdChange,
}: V2PresetsSectionProps) {
	const isDark = useIsDarkTheme();
	const collections = useCollections();

	// Read v2 agent configs from the host service — this is the same
	// data source the v2 /settings/agents page reads and writes, so edits
	// there propagate here. The query is invalidated by those mutations.
	const { activeHostUrl } = useLocalHostService();
	const { data: agents = [] } = useV2AgentConfigs(activeHostUrl);

	const { data: v2Presets = [] } = useLiveQuery(
		(query) =>
			query
				.from({ v2TerminalPresets: collections.v2TerminalPresets })
				.orderBy(({ v2TerminalPresets }) => v2TerminalPresets.tabOrder),
		[collections],
	);

	const { data: v2Projects = [] } = useLiveQuery(
		(query) =>
			query
				.from({ v2Projects: collections.v2Projects })
				.orderBy(({ v2Projects }) => v2Projects.name),
		[collections],
	);

	// V2TerminalPresetRow is a superset of TerminalPreset — safe to cast
	// for the prop-driven sub-components.
	const serverPresets = useMemo<TerminalPreset[]>(
		() => v2Presets as unknown as TerminalPreset[],
		[v2Presets],
	);

	const [localPresets, setLocalPresets] =
		useState<TerminalPreset[]>(serverPresets);
	const [editingPresetId, setEditingPresetId] = useState<string | null>(
		editingPresetIdFromRoute ?? null,
	);
	const presetsContainerRef = useRef<HTMLDivElement>(null);
	const prevPresetsCountRef = useRef(serverPresets.length);
	const serverPresetsRef = useRef(serverPresets);
	const previousServerPresetIdsRef = useRef<Set<string>>(
		new Set(serverPresets.map((preset) => preset.id)),
	);
	const shouldOpenNewPresetEditorRef = useRef(false);
	const lastHandledCreateProjectIdRef = useRef<string | null>(null);

	const projectOptions = useMemo<PresetProjectOption[]>(
		() =>
			v2Projects.map((project) => ({
				id: project.id,
				name: project.name,
				// v2 project schema has no color/mainRepoPath; degrade gracefully.
				color: "",
				mainRepoPath: "",
			})),
		[v2Projects],
	);
	const projectOptionsById = useMemo(
		() => new Map(projectOptions.map((project) => [project.id, project])),
		[projectOptions],
	);

	useEffect(() => {
		serverPresetsRef.current = serverPresets;
	}, [serverPresets]);

	const setEditingPreset = useCallback(
		(presetId: string | null) => {
			setEditingPresetId(presetId);
			onEditingPresetIdChange?.(presetId);
		},
		[onEditingPresetIdChange],
	);

	useEffect(() => {
		setEditingPresetId(editingPresetIdFromRoute ?? null);
	}, [editingPresetIdFromRoute]);

	useEffect(() => {
		setLocalPresets(serverPresets);

		const previousIds = previousServerPresetIdsRef.current;
		if (shouldOpenNewPresetEditorRef.current) {
			const addedPreset = serverPresets.find(
				(preset) => !previousIds.has(preset.id),
			);
			if (addedPreset) {
				setEditingPreset(addedPreset.id);
				shouldOpenNewPresetEditorRef.current = false;
			}
		}

		if (serverPresets.length > prevPresetsCountRef.current) {
			requestAnimationFrame(() => {
				presetsContainerRef.current?.scrollTo({
					top: presetsContainerRef.current.scrollHeight,
					behavior: "smooth",
				});
			});
		}
		prevPresetsCountRef.current = serverPresets.length;
		previousServerPresetIdsRef.current = new Set(
			serverPresets.map((preset) => preset.id),
		);
	}, [serverPresets, setEditingPreset]);

	const editingRowIndex = useMemo(() => {
		if (!editingPresetId) return -1;
		return localPresets.findIndex((preset) => preset.id === editingPresetId);
	}, [editingPresetId, localPresets]);

	const editingPreset = useMemo(
		() => (editingRowIndex >= 0 ? localPresets[editingRowIndex] : null),
		[editingRowIndex, localPresets],
	);

	useEffect(() => {
		if (
			editingPresetId &&
			!localPresets.some((preset) => preset.id === editingPresetId)
		) {
			setEditingPreset(null);
		}
	}, [editingPresetId, localPresets, setEditingPreset]);

	const existingAgentIds = useMemo(
		() =>
			new Set(
				serverPresets
					.map((preset) => (preset as V2TerminalPresetRow).agentId)
					.filter((id): id is string => !!id),
			),
		[serverPresets],
	);

	// One pill per host-agent config — agent.id is unique, so multiple
	// Claude/Codex configs each get their own pill.
	const quickAddPills = useMemo<QuickAddAgentPill[]>(() => {
		const pills: QuickAddAgentPill[] = [];
		for (const agent of agents) {
			if (agent.command.trim().length === 0) {
				continue;
			}
			pills.push({
				agentId: agent.id,
				iconId: agent.presetId,
				label: agent.label,
				description: DESCRIPTION_BY_PRESET_ID.get(agent.presetId) ?? "",
				commands: [buildAgentLaunchCommand(agent)],
			});
		}
		return pills;
	}, [agents]);

	const isPillAdded = useCallback(
		(pill: QuickAddAgentPill) => existingAgentIds.has(pill.agentId),
		[existingAgentIds],
	);

	const insertV2Preset = useCallback(
		(input: {
			name: string;
			description?: string;
			cwd: string;
			commands: string[];
			projectIds?: string[] | null;
			pinnedToBar?: boolean;
			executionMode?: ExecutionMode;
			agentId?: string;
		}) => {
			const maxTabOrder = v2Presets.reduce(
				(max, preset) => Math.max(max, preset.tabOrder),
				-1,
			);
			collections.v2TerminalPresets.insert({
				id: crypto.randomUUID(),
				name: input.name,
				description: input.description,
				cwd: input.cwd,
				commands: input.commands,
				projectIds: input.projectIds ?? null,
				pinnedToBar: input.pinnedToBar,
				executionMode: input.executionMode ?? "new-tab",
				tabOrder: maxTabOrder + 1,
				createdAt: new Date(),
				agentId: input.agentId,
			});
		},
		[collections.v2TerminalPresets, v2Presets],
	);

	const updateV2Preset = useCallback(
		(id: string, patch: Partial<V2TerminalPresetRow>) => {
			collections.v2TerminalPresets.update(id, (draft) => {
				for (const [key, value] of Object.entries(patch) as Array<
					[keyof V2TerminalPresetRow, unknown]
				>) {
					// biome-ignore lint/suspicious/noExplicitAny: narrow assignment across union
					(draft as any)[key] = value;
				}
			});
		},
		[collections.v2TerminalPresets],
	);

	// Migrate legacy rows whose agentId still holds a presetId. Skip when the
	// presetId resolves to multiple configs — we can't pick one safely.
	useEffect(() => {
		if (agents.length === 0 || serverPresets.length === 0) return;

		for (const preset of serverPresets) {
			const row = preset as V2TerminalPresetRow;
			if (!row.agentId) continue;
			if (agents.some((agent) => agent.id === row.agentId)) continue;

			const legacyMatches = agents.filter(
				(agent) => agent.presetId === row.agentId,
			);
			if (legacyMatches.length !== 1) continue;
			const legacyMatch = legacyMatches[0];
			if (!legacyMatch) continue;

			updateV2Preset(row.id, { agentId: legacyMatch.id });
		}
	}, [agents, serverPresets, updateV2Preset]);

	const deleteV2Preset = useCallback(
		(id: string) => {
			collections.v2TerminalPresets.delete(id);
		},
		[collections.v2TerminalPresets],
	);

	const reorderV2Presets = useCallback(
		(presetId: string, targetIndex: number) => {
			const orderedIds = v2Presets.map((preset) => preset.id);
			const currentIndex = orderedIds.indexOf(presetId);
			if (currentIndex === -1) return;
			if (targetIndex < 0 || targetIndex >= orderedIds.length) return;

			const [moved] = orderedIds.splice(currentIndex, 1);
			orderedIds.splice(targetIndex, 0, moved);

			for (const [index, id] of orderedIds.entries()) {
				collections.v2TerminalPresets.update(id, (draft) => {
					draft.tabOrder = index;
				});
			}
		},
		[collections.v2TerminalPresets, v2Presets],
	);

	const handleCellChange = useCallback(
		(rowIndex: number, column: PresetColumnKey, value: string) => {
			setLocalPresets((prev) =>
				prev.map((preset, index) =>
					index === rowIndex ? { ...preset, [column]: value } : preset,
				),
			);
		},
		[],
	);

	const handleCellBlur = useCallback(
		(rowIndex: number, column: PresetColumnKey) => {
			setLocalPresets((currentLocal) => {
				const preset = currentLocal[rowIndex];
				if (!preset) return currentLocal;
				const serverPreset = serverPresetsRef.current.find(
					(serverPresetItem) => serverPresetItem.id === preset.id,
				);
				if (!serverPreset) return currentLocal;
				if (preset[column] === serverPreset[column]) return currentLocal;

				updateV2Preset(preset.id, { [column]: preset[column] });
				return currentLocal;
			});
		},
		[updateV2Preset],
	);

	const handleCommandsChange = useCallback(
		(rowIndex: number, commands: string[]) => {
			setLocalPresets((prev) => {
				const preset = prev[rowIndex];
				const isDelete = preset && commands.length < preset.commands.length;
				const newPresets = prev.map((presetItem, index) =>
					index === rowIndex ? { ...presetItem, commands } : presetItem,
				);

				if (isDelete && preset) {
					updateV2Preset(preset.id, { commands });
				}
				return newPresets;
			});
		},
		[updateV2Preset],
	);

	const handleCommandsBlur = useCallback(
		(rowIndex: number) => {
			setLocalPresets((currentLocal) => {
				const preset = currentLocal[rowIndex];
				if (!preset) return currentLocal;
				const serverPreset = serverPresetsRef.current.find(
					(serverPresetItem) => serverPresetItem.id === preset.id,
				);
				if (!serverPreset) return currentLocal;
				if (
					JSON.stringify(preset.commands) ===
					JSON.stringify(serverPreset.commands)
				) {
					return currentLocal;
				}

				updateV2Preset(preset.id, { commands: preset.commands });
				return currentLocal;
			});
		},
		[updateV2Preset],
	);

	const handleExecutionModeChange = useCallback(
		(rowIndex: number, mode: ExecutionMode) => {
			setLocalPresets((currentLocal) => {
				const preset = currentLocal[rowIndex];
				if (!preset) return currentLocal;

				const newPresets = currentLocal.map((presetItem, index) =>
					index === rowIndex
						? { ...presetItem, executionMode: mode }
						: presetItem,
				);

				updateV2Preset(preset.id, { executionMode: mode });

				return newPresets;
			});
		},
		[updateV2Preset],
	);

	const handleAddRow = useCallback(
		(projectIds?: string[] | null) => {
			shouldOpenNewPresetEditorRef.current = true;
			insertV2Preset({
				name: "",
				cwd: "",
				commands: [""],
				projectIds,
				executionMode: "new-tab",
			});
		},
		[insertV2Preset],
	);

	const handleAddPill = useCallback(
		(pill: QuickAddAgentPill) => {
			if (existingAgentIds.has(pill.agentId)) return;
			insertV2Preset({
				name: pill.label,
				description: pill.description,
				cwd: "",
				commands: pill.commands,
				agentId: pill.agentId,
			});
		},
		[existingAgentIds, insertV2Preset],
	);

	useEffect(() => {
		if (!pendingCreateProjectId) {
			lastHandledCreateProjectIdRef.current = null;
			return;
		}

		if (lastHandledCreateProjectIdRef.current === pendingCreateProjectId) {
			return;
		}

		lastHandledCreateProjectIdRef.current = pendingCreateProjectId;
		handleAddRow([pendingCreateProjectId]);
		onPendingCreateProjectIdChange?.(null);
	}, [handleAddRow, onPendingCreateProjectIdChange, pendingCreateProjectId]);

	const handleDeleteRow = useCallback(
		(rowIndex: number) => {
			setLocalPresets((currentLocal) => {
				const preset = currentLocal[rowIndex];
				if (preset) {
					deleteV2Preset(preset.id);
				}
				return currentLocal;
			});
		},
		[deleteV2Preset],
	);

	const handleToggleAutoApply = useCallback(
		(presetId: string, field: AutoApplyField, enabled: boolean) => {
			updateV2Preset(presetId, { [field]: enabled ? true : undefined });
		},
		[updateV2Preset],
	);

	const handleToggleVisibility = useCallback(
		(presetId: string, visible: boolean) => {
			updateV2Preset(presetId, { pinnedToBar: visible });
		},
		[updateV2Preset],
	);

	const handleLocalReorder = useCallback(
		(fromIndex: number, toIndex: number) => {
			setLocalPresets((prev) => {
				const newPresets = [...prev];
				const [removed] = newPresets.splice(fromIndex, 1);
				newPresets.splice(toIndex, 0, removed);
				return newPresets;
			});
		},
		[],
	);

	const handlePersistReorder = useCallback(
		(presetId: string, targetIndex: number) => {
			reorderV2Presets(presetId, targetIndex);
		},
		[reorderV2Presets],
	);

	const handleCloseEditor = useCallback(() => {
		setEditingPreset(null);
	}, [setEditingPreset]);

	const handleDeleteEditingPreset = useCallback(() => {
		if (editingRowIndex < 0) return;
		handleDeleteRow(editingRowIndex);
		setEditingPreset(null);
	}, [editingRowIndex, handleDeleteRow, setEditingPreset]);

	const isWorkspaceCreation = !!editingPreset?.applyOnWorkspaceCreated;
	const isNewTab = !!editingPreset?.applyOnNewTab;
	const hasMultipleCommands = (editingPreset?.commands.length ?? 0) > 1;
	const normalizedMode = normalizeExecutionMode(editingPreset?.executionMode);
	const modeValue: ExecutionMode = hasMultipleCommands
		? normalizedMode
		: normalizedMode === "split-pane"
			? "split-pane"
			: "new-tab";

	const handleEditorFieldChange = useCallback(
		(column: PresetColumnKey, value: string) => {
			if (editingRowIndex < 0) return;
			handleCellChange(editingRowIndex, column, value);
		},
		[editingRowIndex, handleCellChange],
	);

	const handleEditorFieldBlur = useCallback(
		(column: PresetColumnKey) => {
			if (editingRowIndex < 0) return;
			handleCellBlur(editingRowIndex, column);
		},
		[editingRowIndex, handleCellBlur],
	);

	const handleEditorDirectorySelect = useCallback(
		(value: string) => {
			if (!editingPreset || editingRowIndex < 0) return;

			setLocalPresets((prev) =>
				prev.map((preset, index) =>
					index === editingRowIndex ? { ...preset, cwd: value } : preset,
				),
			);

			updateV2Preset(editingPreset.id, { cwd: value });
		},
		[editingPreset, editingRowIndex, updateV2Preset],
	);

	const handleEditorProjectIdsChange = useCallback(
		(projectIds: string[] | null) => {
			if (!editingPreset || editingRowIndex < 0) return;

			setLocalPresets((prev) =>
				prev.map((preset, index) =>
					index === editingRowIndex ? { ...preset, projectIds } : preset,
				),
			);

			updateV2Preset(editingPreset.id, { projectIds });
		},
		[editingPreset, editingRowIndex, updateV2Preset],
	);

	const handleEditorCommandsChange = useCallback(
		(commands: string[]) => {
			if (editingRowIndex < 0) return;
			handleCommandsChange(editingRowIndex, commands);
		},
		[editingRowIndex, handleCommandsChange],
	);

	const handleEditorCommandsBlur = useCallback(() => {
		if (editingRowIndex < 0) return;
		handleCommandsBlur(editingRowIndex);
	}, [editingRowIndex, handleCommandsBlur]);

	const handleEditorModeChange = useCallback(
		(mode: ExecutionMode) => {
			if (editingRowIndex < 0) return;
			handleExecutionModeChange(editingRowIndex, mode);
		},
		[editingRowIndex, handleExecutionModeChange],
	);

	const handleEditorAutoApplyToggle = useCallback(
		(field: AutoApplyField, enabled: boolean) => {
			if (!editingPreset) return;
			handleToggleAutoApply(editingPreset.id, field, enabled);
		},
		[editingPreset, handleToggleAutoApply],
	);

	return (
		<div>
			<div className="rounded-lg border border-border overflow-hidden divide-y divide-border">
				<div className="flex items-start justify-between gap-3 p-4">
					<div className="min-w-0">
						<h3 className="text-sm font-medium">Terminal presets</h3>
						<p className="text-xs text-muted-foreground mt-0.5">
							Pre-configured terminal launches. Click a preset to edit, drag to
							reorder.
						</p>
					</div>
					<div className="flex shrink-0 items-center gap-2">
						{showQuickAdd && (
							<QuickAddPresets
								pills={quickAddPills}
								isDark={isDark}
								keepOpenOnAdd
								isPillAdded={isPillAdded}
								onAddPill={handleAddPill}
							/>
						)}
						{showPresets && (
							<Button size="sm" onClick={() => handleAddRow()}>
								<HiOutlinePlus className="size-4" />
								Add preset
							</Button>
						)}
					</div>
				</div>

				{showPresets && (
					<PresetsTable
						presets={localPresets}
						isLoading={false}
						projectOptionsById={projectOptionsById}
						agents={agents}
						presetsContainerRef={presetsContainerRef}
						onEdit={setEditingPreset}
						onLocalReorder={handleLocalReorder}
						onPersistReorder={handlePersistReorder}
						onToggleVisibility={handleToggleVisibility}
						bordered={false}
					/>
				)}
			</div>

			<PresetEditorDialog
				preset={editingPreset}
				projects={projectOptions}
				agents={agents}
				open={!!editingPreset}
				onOpenChange={(open) => !open && handleCloseEditor()}
				onDeletePreset={handleDeleteEditingPreset}
				onFieldChange={handleEditorFieldChange}
				onFieldBlur={handleEditorFieldBlur}
				onProjectIdsChange={handleEditorProjectIdsChange}
				onDirectorySelect={handleEditorDirectorySelect}
				onCommandsChange={handleEditorCommandsChange}
				onCommandsBlur={handleEditorCommandsBlur}
				onModeChange={handleEditorModeChange}
				onToggleAutoApply={handleEditorAutoApplyToggle}
				modeValue={modeValue}
				hasMultipleCommands={hasMultipleCommands}
				isWorkspaceCreation={isWorkspaceCreation}
				isNewTab={isNewTab}
			/>
		</div>
	);
}
