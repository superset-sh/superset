import { Button } from "@superset/ui/button";
import { useEffect, useState } from "react";
import { HiOutlinePlus } from "react-icons/hi2";
import { usePresets } from "renderer/react-query/presets";
import { PresetRow } from "./PresetRow";
import {
	PRESET_COLUMNS,
	type PresetColumnKey,
	type TerminalPreset,
} from "./types";

export function PresetsSettings() {
	const {
		presets: serverPresets,
		isLoading,
		createPreset,
		updatePreset,
		deletePreset,
	} = usePresets();
	const [localPresets, setLocalPresets] =
		useState<TerminalPreset[]>(serverPresets);

	useEffect(() => {
		setLocalPresets(serverPresets);
	}, [serverPresets]);

	const handleCellChange = (
		rowIndex: number,
		column: PresetColumnKey,
		value: string,
	) => {
		setLocalPresets((prev) =>
			prev.map((p, i) => (i === rowIndex ? { ...p, [column]: value } : p)),
		);
	};

	const handleCellBlur = (rowIndex: number, column: PresetColumnKey) => {
		const preset = localPresets[rowIndex];
		const serverPreset = serverPresets[rowIndex];
		if (!preset || !serverPreset) return;
		if (preset[column] === serverPreset[column]) return;

		updatePreset.mutate({
			id: preset.id,
			patch: { [column]: preset[column] },
		});
	};

	const handleCommandsChange = (rowIndex: number, commands: string[]) => {
		setLocalPresets((prev) =>
			prev.map((p, i) => (i === rowIndex ? { ...p, commands } : p)),
		);
	};

	const handleCommandsBlur = (rowIndex: number) => {
		const preset = localPresets[rowIndex];
		const serverPreset = serverPresets[rowIndex];
		if (!preset || !serverPreset) return;
		if (
			JSON.stringify(preset.commands) === JSON.stringify(serverPreset.commands)
		)
			return;

		updatePreset.mutate({
			id: preset.id,
			patch: { commands: preset.commands },
		});
	};

	const handleAddRow = () => {
		createPreset.mutate({
			name: "",
			cwd: "",
			commands: [""],
		});
	};

	const handleDeleteRow = (rowIndex: number) => {
		const preset = localPresets[rowIndex];
		if (!preset) return;

		deletePreset.mutate({ id: preset.id });
	};

	if (isLoading) {
		return (
			<div className="p-6 w-full max-w-6xl">
				<div className="animate-pulse space-y-4">
					<div className="h-8 bg-muted rounded w-1/3" />
					<div className="h-32 bg-muted rounded" />
				</div>
			</div>
		);
	}

	return (
		<div className="p-6 w-full max-w-6xl">
			<div className="mb-6">
				<div className="flex items-center justify-between mb-2">
					<h2 className="text-lg font-semibold">Terminal Presets</h2>
					<Button
						variant="default"
						size="sm"
						className="gap-2"
						onClick={handleAddRow}
					>
						<HiOutlinePlus className="h-4 w-4" />
						Add Preset
					</Button>
				</div>
				<p className="text-sm text-muted-foreground">
					Create and manage terminal presets for quick terminal creation. Press
					Enter to add a new command.
				</p>
			</div>

			<div className="rounded-lg border border-border overflow-hidden">
				<div className="flex items-center gap-4 py-2 px-4 bg-accent/10 border-b border-border">
					{PRESET_COLUMNS.map((column) => (
						<div
							key={column.key}
							className="flex-1 text-xs font-medium text-muted-foreground uppercase tracking-wider"
						>
							{column.label}
						</div>
					))}
					<div className="w-12 text-xs font-medium text-muted-foreground uppercase tracking-wider text-center shrink-0">
						Actions
					</div>
				</div>

				<div className="max-h-[calc(100vh-320px)] overflow-y-auto">
					{localPresets.length > 0 ? (
						localPresets.map((preset, index) => (
							<PresetRow
								key={preset.id}
								preset={preset}
								rowIndex={index}
								isEven={index % 2 === 0}
								onChange={handleCellChange}
								onBlur={handleCellBlur}
								onCommandsChange={handleCommandsChange}
								onCommandsBlur={handleCommandsBlur}
								onDelete={handleDeleteRow}
							/>
						))
					) : (
						<div className="py-8 text-center text-sm text-muted-foreground">
							No presets yet. Click "Add Preset" to create your first preset.
						</div>
					)}
				</div>
			</div>
		</div>
	);
}
