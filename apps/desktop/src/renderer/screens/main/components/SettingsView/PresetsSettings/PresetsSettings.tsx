import { Button } from "@superset/ui/button";
import { useEffect, useMemo, useState } from "react";
import { HiOutlineCheck, HiOutlinePlus } from "react-icons/hi2";
import {
	getPresetIcon,
	useIsDarkTheme,
} from "renderer/assets/app-icons/preset-icons";
import { usePresets } from "renderer/react-query/presets";
import { PresetRow } from "./PresetRow";
import {
	PRESET_COLUMNS,
	type PresetColumnKey,
	type TerminalPreset,
} from "./types";

interface PresetTemplate {
	name: string;
	preset: {
		name: string;
		description: string;
		cwd: string;
		commands: string[];
	};
}

const PRESET_TEMPLATES: PresetTemplate[] = [
	{
		name: "codex",
		preset: {
			name: "codex",
			description: "Danger mode: All permissions auto-approved",
			cwd: "",
			commands: [
				'codex -c model_reasoning_effort="high" --ask-for-approval never --sandbox danger-full-access -c model_reasoning_summary="detailed" -c model_supports_reasoning_summaries=true',
			],
		},
	},
	{
		name: "claude",
		preset: {
			name: "claude",
			description: "Danger mode: All permissions auto-approved",
			cwd: "",
			commands: ["claude --dangerously-skip-permissions"],
		},
	},
	{
		name: "gemini",
		preset: {
			name: "gemini",
			description: "Danger mode: All permissions auto-approved",
			cwd: "",
			commands: ["gemini --yolo"],
		},
	},
	{
		name: "cursor-agent",
		preset: {
			name: "cursor-agent",
			description: "Cursor AI agent for terminal-based coding assistance",
			cwd: "",
			commands: ["cursor-agent"],
		},
	},
];

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
	const isDark = useIsDarkTheme();

	useEffect(() => {
		setLocalPresets(serverPresets);
	}, [serverPresets]);

	const existingPresetNames = useMemo(
		() => new Set(serverPresets.map((p) => p.name)),
		[serverPresets],
	);

	const isTemplateAdded = (template: PresetTemplate) =>
		existingPresetNames.has(template.preset.name);

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

	const handleAddTemplate = (template: PresetTemplate) => {
		if (isTemplateAdded(template)) return;
		createPreset.mutate(template.preset);
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
				<p className="text-sm text-muted-foreground mb-4">
					Presets let you quickly launch terminals with pre-configured commands.
					Create a preset below, then use it from the "New Terminal" dropdown in
					any workspace.
				</p>

				<div className="flex flex-wrap gap-2">
					<span className="text-xs text-muted-foreground mr-1 self-center">
						Quick add:
					</span>
					{PRESET_TEMPLATES.map((template) => {
						const alreadyAdded = isTemplateAdded(template);
						const presetIcon = getPresetIcon(template.name, isDark);
						return (
							<Button
								key={template.name}
								variant="outline"
								size="sm"
								className="gap-1.5 text-xs h-7"
								onClick={() => handleAddTemplate(template)}
								title={
									alreadyAdded ? "Already added" : template.preset.description
								}
								disabled={alreadyAdded || createPreset.isPending}
							>
								{alreadyAdded ? (
									<HiOutlineCheck className="h-3 w-3" />
								) : presetIcon ? (
									<img
										src={presetIcon}
										alt=""
										className="h-3 w-3 object-contain"
									/>
								) : null}
								{template.name}
							</Button>
						);
					})}
				</div>
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
