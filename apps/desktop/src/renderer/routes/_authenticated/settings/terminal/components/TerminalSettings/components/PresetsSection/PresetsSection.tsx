import type { ExecutionMode, TerminalPreset } from "@superset/local-db";
import { Button } from "@superset/ui/button";
import { Label } from "@superset/ui/label";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { HiOutlinePlus } from "react-icons/hi2";
import { useIsDarkTheme } from "renderer/assets/app-icons/preset-icons";
import { usePresets } from "renderer/react-query/presets";
import type { PresetColumnKey } from "renderer/routes/_authenticated/settings/presets/types";
import { PresetEditorSheet } from "./components/PresetEditorSheet";
import { PresetsTable } from "./components/PresetsTable";
import { QuickAddPresets } from "./components/QuickAddPresets";
import {
	type AutoApplyField,
	PRESET_TEMPLATES,
	type PresetTemplate,
} from "./constants";

interface PresetsSectionProps {
	showPresets: boolean;
	showQuickAdd: boolean;
	editingPresetId?: string | null;
	onEditingPresetIdChange?: (presetId: string | null) => void;
}

export function PresetsSection({
	showPresets,
	showQuickAdd,
	editingPresetId: editingPresetIdFromRoute,
	onEditingPresetIdChange,
}: PresetsSectionProps) {
	const isDark = useIsDarkTheme();
	const {
		presets: serverPresets,
		isLoading: isLoadingPresets,
		createPreset,
		updatePreset,
		deletePreset,
		setPresetAutoApply,
		reorderPresets,
	} = usePresets();

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

	const existingPresetNames = useMemo(
		() => new Set(serverPresets.map((preset) => preset.name)),
		[serverPresets],
	);

	const isTemplateAdded = useCallback(
		(template: PresetTemplate) => existingPresetNames.has(template.preset.name),
		[existingPresetNames],
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

				updatePreset.mutate({
					id: preset.id,
					patch: { [column]: preset[column] },
				});
				return currentLocal;
			});
		},
		[updatePreset],
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
					updatePreset.mutate({
						id: preset.id,
						patch: { commands },
					});
				}
				return newPresets;
			});
		},
		[updatePreset],
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

				updatePreset.mutate({
					id: preset.id,
					patch: { commands: preset.commands },
				});
				return currentLocal;
			});
		},
		[updatePreset],
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

				updatePreset.mutate({
					id: preset.id,
					patch: { executionMode: mode },
				});

				return newPresets;
			});
		},
		[updatePreset],
	);

	const handleAddRow = useCallback(() => {
		shouldOpenNewPresetEditorRef.current = true;
		createPreset.mutate({
			name: "",
			cwd: "",
			commands: [""],
			executionMode: "split-pane",
		});
	}, [createPreset]);

	const handleAddTemplate = useCallback(
		(template: PresetTemplate) => {
			if (existingPresetNames.has(template.preset.name)) return;
			createPreset.mutate(template.preset);
		},
		[createPreset, existingPresetNames],
	);

	const handleDeleteRow = useCallback(
		(rowIndex: number) => {
			setLocalPresets((currentLocal) => {
				const preset = currentLocal[rowIndex];
				if (preset) {
					deletePreset.mutate({ id: preset.id });
				}
				return currentLocal;
			});
		},
		[deletePreset],
	);

	const handleToggleAutoApply = useCallback(
		(presetId: string, field: AutoApplyField, enabled: boolean) => {
			setPresetAutoApply.mutate({ id: presetId, field, enabled });
		},
		[setPresetAutoApply],
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
			reorderPresets.mutate({ presetId, targetIndex });
		},
		[reorderPresets],
	);

	const handleCloseEditor = useCallback(() => {
		setEditingPreset(null);
	}, [setEditingPreset]);

	const handleDeleteEditingPreset = useCallback(() => {
		if (editingRowIndex < 0) return;
		handleDeleteRow(editingRowIndex);
		setEditingPreset(null);
	}, [editingRowIndex, handleDeleteRow, setEditingPreset]);

	const isWorkspaceCreation = !!(
		editingPreset?.applyOnWorkspaceCreated ||
		(!editingPreset?.applyOnNewTab && editingPreset?.isDefault)
	);
	const isNewTab = !!(
		editingPreset?.applyOnNewTab ||
		(!editingPreset?.applyOnWorkspaceCreated && editingPreset?.isDefault)
	);
	const hasMultipleCommands = (editingPreset?.commands.length ?? 0) > 1;
	const modeValue: ExecutionMode =
		editingPreset?.executionMode === "new-tab" ||
		editingPreset?.executionMode === "new-tab-split-pane"
			? hasMultipleCommands
				? editingPreset.executionMode
				: "new-tab"
			: "split-pane";

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
		<div className="space-y-4">
			<div className="flex items-center justify-between">
				<div className="space-y-0.5">
					<Label className="text-sm font-medium">Terminal Presets</Label>
					<p className="text-xs text-muted-foreground">
						Presets let you quickly launch terminals with pre-configured
						commands.
					</p>
				</div>
				{showPresets && (
					<Button
						variant="default"
						size="sm"
						className="gap-2"
						onClick={handleAddRow}
					>
						<HiOutlinePlus className="h-4 w-4" />
						Add Preset
					</Button>
				)}
			</div>

			{showQuickAdd && (
				<QuickAddPresets
					templates={PRESET_TEMPLATES}
					isDark={isDark}
					isCreatePending={createPreset.isPending}
					isTemplateAdded={isTemplateAdded}
					onAddTemplate={handleAddTemplate}
				/>
			)}

			{showPresets && (
				<>
					<PresetsTable
						presets={localPresets}
						isLoading={isLoadingPresets}
						presetsContainerRef={presetsContainerRef}
						onEdit={setEditingPreset}
						onLocalReorder={handleLocalReorder}
						onPersistReorder={handlePersistReorder}
					/>
					<p className="text-xs text-muted-foreground">
						Click a preset row to edit details.
					</p>
				</>
			)}

			<PresetEditorSheet
				preset={editingPreset}
				open={!!editingPreset}
				onOpenChange={(open) => !open && handleCloseEditor()}
				onDeletePreset={handleDeleteEditingPreset}
				onFieldChange={handleEditorFieldChange}
				onFieldBlur={handleEditorFieldBlur}
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
