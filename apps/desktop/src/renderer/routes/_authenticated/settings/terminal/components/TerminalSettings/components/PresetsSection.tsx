import type { ExecutionMode, TerminalPreset } from "@superset/local-db";
import {
	AGENT_PRESET_COMMANDS,
	AGENT_PRESET_DESCRIPTIONS,
	AGENT_TYPES,
} from "@superset/shared/agent-command";
import { Button } from "@superset/ui/button";
import { Label } from "@superset/ui/label";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
	HiOutlineCheck,
	HiOutlinePlus,
	HiOutlineQuestionMarkCircle,
} from "react-icons/hi2";
import {
	getPresetIcon,
	useIsDarkTheme,
} from "renderer/assets/app-icons/preset-icons";
import { usePresets } from "renderer/react-query/presets";
import {
	PRESET_COLUMNS,
	type PresetColumnKey,
} from "renderer/routes/_authenticated/settings/presets/types";
import { PresetRow } from "./PresetRow";

interface PresetTemplate {
	name: string;
	preset: {
		name: string;
		description: string;
		cwd: string;
		commands: string[];
	};
}

const PRESET_TEMPLATES: PresetTemplate[] = AGENT_TYPES.map((agent) => ({
	name: agent,
	preset: {
		name: agent,
		description: AGENT_PRESET_DESCRIPTIONS[agent],
		cwd: "",
		commands: AGENT_PRESET_COMMANDS[agent],
	},
}));

interface PresetsSectionProps {
	showPresets: boolean;
	showQuickAdd: boolean;
}

export function PresetsSection({
	showPresets,
	showQuickAdd,
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
	const presetsContainerRef = useRef<HTMLDivElement>(null);
	const prevPresetsCountRef = useRef(serverPresets.length);
	const serverPresetsRef = useRef(serverPresets);

	useEffect(() => {
		serverPresetsRef.current = serverPresets;
	}, [serverPresets]);

	useEffect(() => {
		setLocalPresets(serverPresets);

		if (serverPresets.length > prevPresetsCountRef.current) {
			requestAnimationFrame(() => {
				presetsContainerRef.current?.scrollTo({
					top: presetsContainerRef.current.scrollHeight,
					behavior: "smooth",
				});
			});
		}
		prevPresetsCountRef.current = serverPresets.length;
	}, [serverPresets]);

	const existingPresetNames = useMemo(
		() => new Set(serverPresets.map((p) => p.name)),
		[serverPresets],
	);

	const isTemplateAdded = (template: PresetTemplate) =>
		existingPresetNames.has(template.preset.name);

	const handleCellChange = useCallback(
		(rowIndex: number, column: PresetColumnKey, value: string) => {
			setLocalPresets((prev) =>
				prev.map((p, i) => (i === rowIndex ? { ...p, [column]: value } : p)),
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
					(p) => p.id === preset.id,
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
				const newPresets = prev.map((p, i) =>
					i === rowIndex ? { ...p, commands } : p,
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
					(p) => p.id === preset.id,
				);
				if (!serverPreset) return currentLocal;
				if (
					JSON.stringify(preset.commands) ===
					JSON.stringify(serverPreset.commands)
				)
					return currentLocal;

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

				const newPresets = currentLocal.map((p, i) =>
					i === rowIndex ? { ...p, executionMode: mode } : p,
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
		createPreset.mutate({
			name: "",
			cwd: "",
			commands: [""],
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
		(
			presetId: string,
			field: "applyOnWorkspaceCreated" | "applyOnNewTab",
			enabled: boolean,
		) => {
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
				<div className="flex flex-wrap gap-2">
					<span className="text-xs text-muted-foreground mr-1 self-center">
						Quick add:
					</span>
					{PRESET_TEMPLATES.map((template) => {
						const alreadyAdded = isTemplateAdded(template);
						const presetIcon = getPresetIcon(template.name, isDark);
						return (
							<Tooltip key={template.name}>
								<TooltipTrigger asChild>
									<Button
										variant="outline"
										size="sm"
										className="gap-1.5 text-xs h-7"
										onClick={() => handleAddTemplate(template)}
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
								</TooltipTrigger>
								<TooltipContent side="bottom" showArrow={false}>
									{alreadyAdded ? "Already added" : template.preset.description}
								</TooltipContent>
							</Tooltip>
						);
					})}
				</div>
			)}

			{showPresets && (
				<div className="rounded-lg border border-border overflow-hidden">
					<div className="flex items-center gap-4 py-2 px-4 bg-accent/10 border-b border-border">
						<div className="w-6 shrink-0" />
						{PRESET_COLUMNS.map((column) =>
							column.tooltip ? (
								<Tooltip key={column.key}>
									<TooltipTrigger asChild>
										<div className="flex-1 text-xs font-medium text-muted-foreground uppercase tracking-wider cursor-help flex items-center gap-1">
											{column.label}
											<HiOutlineQuestionMarkCircle className="h-3.5 w-3.5" />
										</div>
									</TooltipTrigger>
									<TooltipContent side="top" className="max-w-xs">
										{column.tooltip}
									</TooltipContent>
								</Tooltip>
							) : (
								<div
									key={column.key}
									className="flex-1 text-xs font-medium text-muted-foreground uppercase tracking-wider"
								>
									{column.label}
								</div>
							),
						)}
						<Tooltip>
							<TooltipTrigger asChild>
								<div className="w-28 text-xs font-medium text-muted-foreground uppercase tracking-wider shrink-0 cursor-help flex items-center gap-1">
									Mode
									<HiOutlineQuestionMarkCircle className="h-3.5 w-3.5" />
								</div>
							</TooltipTrigger>
							<TooltipContent side="top" className="max-w-xs">
								<p className="font-medium mb-1">Execution Mode</p>
								<p className="text-xs">
									<strong>Sequential:</strong> Commands run one after another in
									a single terminal (joined with &&)
								</p>
								<p className="text-xs mt-1">
									<strong>Parallel:</strong> Each command runs in its own split
									pane within a single tab
								</p>
							</TooltipContent>
						</Tooltip>
						<Tooltip>
							<TooltipTrigger asChild>
								<div className="w-[7rem] text-xs font-medium text-muted-foreground uppercase tracking-wider shrink-0 cursor-help flex items-center justify-center gap-1">
									Workspace
									<HiOutlineQuestionMarkCircle className="h-3.5 w-3.5" />
								</div>
							</TooltipTrigger>
							<TooltipContent side="top" className="max-w-xs">
								Auto-run this preset when creating a new workspace
							</TooltipContent>
						</Tooltip>
						<Tooltip>
							<TooltipTrigger asChild>
								<div className="w-14 text-xs font-medium text-muted-foreground uppercase tracking-wider shrink-0 cursor-help flex items-center justify-center gap-1">
									Tab
									<HiOutlineQuestionMarkCircle className="h-3.5 w-3.5" />
								</div>
							</TooltipTrigger>
							<TooltipContent side="top" className="max-w-xs">
								Auto-run this preset when opening a new tab
							</TooltipContent>
						</Tooltip>
						<div className="w-10 shrink-0" />
					</div>

					<div
						ref={presetsContainerRef}
						className="max-h-[320px] overflow-y-auto"
					>
						{isLoadingPresets ? (
							<div className="py-8 text-center text-sm text-muted-foreground">
								Loading presets...
							</div>
						) : localPresets.length > 0 ? (
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
									onExecutionModeChange={handleExecutionModeChange}
									onDelete={handleDeleteRow}
									onToggleAutoApply={handleToggleAutoApply}
									onLocalReorder={handleLocalReorder}
									onPersistReorder={handlePersistReorder}
								/>
							))
						) : (
							<div className="py-8 text-center text-sm text-muted-foreground">
								No presets yet. Click "Add Preset" to create your first preset.
							</div>
						)}
					</div>
				</div>
			)}
		</div>
	);
}
