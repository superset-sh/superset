import { Button } from "@superset/ui/button";
import { useState } from "react";
import { HiOutlinePlus } from "react-icons/hi2";
import { PresetRow } from "./PresetRow";
import {
	createEmptyPreset,
	MOCK_PRESETS,
	PRESET_COLUMNS,
	type PresetColumnKey,
	type TerminalPreset,
} from "./types";

export function PresetsSettings() {
	const [presets, setPresets] = useState<TerminalPreset[]>(MOCK_PRESETS);

	const handleCellChange = (
		rowIndex: number,
		column: PresetColumnKey,
		value: string,
	) => {
		setPresets((prev) => {
			const updated = [...prev];
			updated[rowIndex] = { ...updated[rowIndex], [column]: value };
			return updated;
		});
	};

	const handleCommandsChange = (rowIndex: number, commands: string[]) => {
		setPresets((prev) => {
			const updated = [...prev];
			updated[rowIndex] = { ...updated[rowIndex], commands };
			return updated;
		});
	};

	const handleAddRow = () => {
		setPresets((prev) => [...prev, createEmptyPreset()]);
	};

	const handleDeleteRow = (rowIndex: number) => {
		setPresets((prev) => prev.filter((_, index) => index !== rowIndex));
	};

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
					{presets.length > 0 ? (
						presets.map((preset, index) => (
							<PresetRow
								key={preset.id}
								preset={preset}
								rowIndex={index}
								isEven={index % 2 === 0}
								onChange={handleCellChange}
								onCommandsChange={handleCommandsChange}
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
