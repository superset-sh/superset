import type { AgentPreset } from "@superset/local-db";
import { Button } from "@superset/ui/button";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@superset/ui/collapsible";
import { Input } from "@superset/ui/input";
import { Label } from "@superset/ui/label";
import { Switch } from "@superset/ui/switch";
import { Textarea } from "@superset/ui/textarea";
import { useEffect, useRef, useState } from "react";
import { HiChevronDown, HiChevronRight } from "react-icons/hi2";
import {
	getPresetIcon,
	useIsDarkTheme,
} from "renderer/assets/app-icons/preset-icons";
import { useAgentPresets } from "renderer/react-query/agent-presets";
import { getDefaultAgentPreset } from "shared/utils/agent-preset-settings";
import {
	isItemVisible,
	SETTING_ITEM_ID,
	type SettingItemId,
} from "../../../utils/settings-search";

interface AgentSettingsProps {
	visibleItems?: SettingItemId[] | null;
}

type AgentTextField =
	| "label"
	| "description"
	| "command"
	| "promptCommand"
	| "promptCommandSuffix"
	| "taskPromptTemplate";

type AgentPresetPatch = {
	label?: string;
	description?: string | null;
	command?: string;
	promptCommand?: string;
	promptCommandSuffix?: string | null;
	taskPromptTemplate?: string;
	enabled?: boolean;
};

function getFieldValue(preset: AgentPreset, field: AgentTextField): string {
	switch (field) {
		case "label":
			return preset.label;
		case "description":
			return preset.description ?? "";
		case "command":
			return preset.command;
		case "promptCommand":
			return preset.promptCommand;
		case "promptCommandSuffix":
			return preset.promptCommandSuffix ?? "";
		case "taskPromptTemplate":
			return preset.taskPromptTemplate;
	}
}

function isRequiredField(field: AgentTextField): boolean {
	return (
		field === "label" ||
		field === "command" ||
		field === "promptCommand" ||
		field === "taskPromptTemplate"
	);
}

function mergePresetWithLocalEdits({
	localPreset,
	serverPreset,
	previousServerPreset,
}: {
	localPreset: AgentPreset;
	serverPreset: AgentPreset;
	previousServerPreset: AgentPreset;
}): AgentPreset {
	return {
		...serverPreset,
		label:
			localPreset.label !== previousServerPreset.label
				? localPreset.label
				: serverPreset.label,
		description:
			localPreset.description !== previousServerPreset.description
				? localPreset.description
				: serverPreset.description,
		command:
			localPreset.command !== previousServerPreset.command
				? localPreset.command
				: serverPreset.command,
		promptCommand:
			localPreset.promptCommand !== previousServerPreset.promptCommand
				? localPreset.promptCommand
				: serverPreset.promptCommand,
		promptCommandSuffix:
			localPreset.promptCommandSuffix !==
			previousServerPreset.promptCommandSuffix
				? localPreset.promptCommandSuffix
				: serverPreset.promptCommandSuffix,
		taskPromptTemplate:
			localPreset.taskPromptTemplate !== previousServerPreset.taskPromptTemplate
				? localPreset.taskPromptTemplate
				: serverPreset.taskPromptTemplate,
		enabled:
			localPreset.enabled !== previousServerPreset.enabled
				? localPreset.enabled
				: serverPreset.enabled,
	};
}

export function AgentSettings({ visibleItems }: AgentSettingsProps) {
	const showAgents = isItemVisible(SETTING_ITEM_ID.AGENT_PRESETS, visibleItems);
	const showPromptTemplate = isItemVisible(
		SETTING_ITEM_ID.AGENT_PROMPT_TEMPLATE,
		visibleItems,
	);
	const isDark = useIsDarkTheme();

	const { presets: serverPresets, isLoading, updatePreset } = useAgentPresets();
	const [localPresets, setLocalPresets] =
		useState<AgentPreset[]>(serverPresets);
	const serverPresetsRef = useRef(serverPresets);

	useEffect(() => {
		const previousServerPresetsById = new Map(
			serverPresetsRef.current.map((preset) => [preset.id, preset] as const),
		);
		setLocalPresets((currentPresets) => {
			if (currentPresets.length === 0) {
				return serverPresets;
			}

			const localPresetsById = new Map(
				currentPresets.map((preset) => [preset.id, preset] as const),
			);

			return serverPresets.map((serverPreset) => {
				const localPreset = localPresetsById.get(serverPreset.id);
				if (!localPreset) {
					return serverPreset;
				}

				const previousServerPreset = previousServerPresetsById.get(
					serverPreset.id,
				);
				if (!previousServerPreset) {
					return localPreset;
				}

				return mergePresetWithLocalEdits({
					localPreset,
					serverPreset,
					previousServerPreset,
				});
			});
		});
		serverPresetsRef.current = serverPresets;
	}, [serverPresets]);

	const showCards = showAgents || showPromptTemplate;

	const updateLocalField = (
		presetId: AgentPreset["id"],
		field: AgentTextField,
		value: string,
	) => {
		setLocalPresets((current) =>
			current.map((preset) =>
				preset.id === presetId ? { ...preset, [field]: value } : preset,
			),
		);
	};

	const rollbackFieldFromServer = (
		presetId: AgentPreset["id"],
		field: AgentTextField,
	) => {
		const serverPreset = serverPresetsRef.current.find(
			(preset) => preset.id === presetId,
		);
		if (!serverPreset) return;

		updateLocalField(presetId, field, getFieldValue(serverPreset, field));
	};

	const rollbackPresetFromServer = (presetId: AgentPreset["id"]) => {
		const serverPreset = serverPresetsRef.current.find(
			(preset) => preset.id === presetId,
		);
		if (!serverPreset) return;

		setLocalPresets((current) =>
			current.map((preset) => (preset.id === presetId ? serverPreset : preset)),
		);
	};

	const mutatePresetWithRollback = ({
		presetId,
		patch,
		rollbackField,
	}: {
		presetId: AgentPreset["id"];
		patch: AgentPresetPatch;
		rollbackField?: AgentTextField;
	}) => {
		updatePreset.mutate(
			{ id: presetId, patch },
			{
				onError: () => {
					if (rollbackField) {
						rollbackFieldFromServer(presetId, rollbackField);
						return;
					}

					rollbackPresetFromServer(presetId);
				},
			},
		);
	};

	const handleFieldBlur = (
		presetId: AgentPreset["id"],
		field: AgentTextField,
	) => {
		const localPreset = localPresets.find((preset) => preset.id === presetId);
		const serverPreset = serverPresetsRef.current.find(
			(preset) => preset.id === presetId,
		);
		if (!localPreset || !serverPreset) return;

		const localValue = getFieldValue(localPreset, field);
		const serverValue = getFieldValue(serverPreset, field);

		if (localValue === serverValue) return;

		if (isRequiredField(field) && localValue.trim().length === 0) {
			updateLocalField(presetId, field, serverValue);
			return;
		}

		switch (field) {
			case "label":
				mutatePresetWithRollback({
					presetId: localPreset.id,
					patch: { label: localValue.trim() },
					rollbackField: "label",
				});
				return;
			case "description":
				mutatePresetWithRollback({
					presetId: localPreset.id,
					patch: { description: localValue.trim() || null },
					rollbackField: "description",
				});
				return;
			case "command":
				mutatePresetWithRollback({
					presetId: localPreset.id,
					patch: { command: localValue.trim() },
					rollbackField: "command",
				});
				return;
			case "promptCommand":
				mutatePresetWithRollback({
					presetId: localPreset.id,
					patch: { promptCommand: localValue.trim() },
					rollbackField: "promptCommand",
				});
				return;
			case "promptCommandSuffix":
				mutatePresetWithRollback({
					presetId: localPreset.id,
					patch: { promptCommandSuffix: localValue.trim() || null },
					rollbackField: "promptCommandSuffix",
				});
				return;
			case "taskPromptTemplate":
				mutatePresetWithRollback({
					presetId: localPreset.id,
					patch: { taskPromptTemplate: localValue.trim() },
					rollbackField: "taskPromptTemplate",
				});
				return;
		}
	};

	const handleEnabledChange = (
		presetId: AgentPreset["id"],
		enabled: boolean,
	) => {
		setLocalPresets((current) =>
			current.map((preset) =>
				preset.id === presetId ? { ...preset, enabled } : preset,
			),
		);
		mutatePresetWithRollback({
			presetId,
			patch: { enabled },
		});
	};

	const handleResetPresetToDefault = (presetId: AgentPreset["id"]) => {
		if (updatePreset.isPending) return;

		const preset = localPresets.find((item) => item.id === presetId);
		const shouldReset = window.confirm(
			`Reset ${preset?.label ?? "this agent"} to default commands, prompts, and template?`,
		);
		if (!shouldReset) return;

		const defaults = getDefaultAgentPreset(presetId);
		setLocalPresets((current) =>
			current.map((item) => (item.id === presetId ? defaults : item)),
		);
		mutatePresetWithRollback({
			presetId,
			patch: {
				label: defaults.label,
				description: defaults.description ?? null,
				command: defaults.command,
				promptCommand: defaults.promptCommand,
				promptCommandSuffix: defaults.promptCommandSuffix ?? null,
				taskPromptTemplate: defaults.taskPromptTemplate,
				enabled: defaults.enabled ?? true,
			},
		});
	};

	return (
		<div className="p-6 max-w-7xl w-full">
			<div className="mb-8">
				<h2 className="text-xl font-semibold">Agent</h2>
				<p className="text-sm text-muted-foreground mt-1">
					Configure agent dropdown commands and task prompt templates
				</p>
			</div>

			{showCards && (
				<div className="space-y-4">
					{isLoading && (
						<p className="text-xs text-muted-foreground">Loading agents...</p>
					)}

					{localPresets.map((preset) => {
						const icon = getPresetIcon(preset.id, isDark);
						const enabled = preset.enabled ?? true;

						return (
							<Collapsible key={preset.id} defaultOpen={false}>
								<div className="rounded-lg border border-border">
									<div className="flex items-center justify-between gap-3 p-4">
										<CollapsibleTrigger className="group flex items-center gap-2 min-w-0 flex-1 text-left">
											{icon && (
												<img
													src={icon}
													alt=""
													className="size-4 object-contain"
												/>
											)}
											<p className="font-medium truncate">{preset.label}</p>
											<HiChevronRight className="h-4 w-4 text-muted-foreground group-data-[state=open]:hidden" />
											<HiChevronDown className="h-4 w-4 text-muted-foreground group-data-[state=closed]:hidden" />
										</CollapsibleTrigger>
										<div className="flex items-center gap-2 shrink-0">
											<Label
												htmlFor={`agent-enabled-${preset.id}`}
												className="text-xs text-muted-foreground"
											>
												Enabled
											</Label>
											<Switch
												id={`agent-enabled-${preset.id}`}
												checked={enabled}
												onCheckedChange={(checked) =>
													handleEnabledChange(preset.id, checked)
												}
											/>
										</div>
									</div>

									<CollapsibleContent>
										<div className="space-y-4 px-4 pb-4">
											<div className="flex justify-end">
												<Button
													type="button"
													variant="outline"
													size="sm"
													onClick={() => handleResetPresetToDefault(preset.id)}
													disabled={updatePreset.isPending}
												>
													Reset to defaults
												</Button>
											</div>
											{showAgents && (
												<>
													<div className="space-y-1.5">
														<Label htmlFor={`agent-label-${preset.id}`}>
															Label
														</Label>
														<Input
															id={`agent-label-${preset.id}`}
															value={preset.label}
															onChange={(e) =>
																updateLocalField(
																	preset.id,
																	"label",
																	e.target.value,
																)
															}
															onBlur={() => handleFieldBlur(preset.id, "label")}
														/>
													</div>

													<div className="space-y-1.5">
														<Label htmlFor={`agent-command-${preset.id}`}>
															Command (No Prompt)
														</Label>
														<Input
															id={`agent-command-${preset.id}`}
															value={preset.command}
															onChange={(e) =>
																updateLocalField(
																	preset.id,
																	"command",
																	e.target.value,
																)
															}
															onBlur={() =>
																handleFieldBlur(preset.id, "command")
															}
														/>
													</div>

													<div className="space-y-1.5">
														<Label
															htmlFor={`agent-prompt-command-${preset.id}`}
														>
															Command (With Prompt)
														</Label>
														<Input
															id={`agent-prompt-command-${preset.id}`}
															value={preset.promptCommand}
															onChange={(e) =>
																updateLocalField(
																	preset.id,
																	"promptCommand",
																	e.target.value,
																)
															}
															onBlur={() =>
																handleFieldBlur(preset.id, "promptCommand")
															}
														/>
													</div>

													<div className="space-y-1.5">
														<Label htmlFor={`agent-prompt-suffix-${preset.id}`}>
															Prompt Command Suffix (Optional)
														</Label>
														<Input
															id={`agent-prompt-suffix-${preset.id}`}
															value={preset.promptCommandSuffix ?? ""}
															onChange={(e) =>
																updateLocalField(
																	preset.id,
																	"promptCommandSuffix",
																	e.target.value,
																)
															}
															onBlur={() =>
																handleFieldBlur(
																	preset.id,
																	"promptCommandSuffix",
																)
															}
															placeholder="e.g. --yolo"
														/>
													</div>
												</>
											)}

											{showPromptTemplate && (
												<div className="space-y-1.5">
													<Label htmlFor={`agent-task-prompt-${preset.id}`}>
														Task Prompt Template
													</Label>
													<Textarea
														id={`agent-task-prompt-${preset.id}`}
														value={preset.taskPromptTemplate}
														onChange={(e) =>
															updateLocalField(
																preset.id,
																"taskPromptTemplate",
																e.target.value,
															)
														}
														onBlur={() =>
															handleFieldBlur(preset.id, "taskPromptTemplate")
														}
														className="min-h-40 font-mono text-xs"
													/>
													<p className="text-xs text-muted-foreground">
														Supported variables: {"{{id}}"}, {"{{slug}}"},{" "}
														{"{{title}}"}, {"{{description}}"}, {"{{priority}}"}
														, {"{{statusName}}"}, {"{{labels}}"}
													</p>
												</div>
											)}
										</div>
									</CollapsibleContent>
								</div>
							</Collapsible>
						);
					})}
				</div>
			)}
		</div>
	);
}
