import type {
	AgentPresetPatch,
	ResolvedAgentConfig,
} from "@superset/shared/agent-settings";
import { Card, CardContent } from "@superset/ui/card";
import { Collapsible, CollapsibleContent } from "@superset/ui/collapsible";
import { toast } from "@superset/ui/sonner";
import { useMemo, useState } from "react";
import { electronTrpc } from "renderer/lib/electron-trpc";
import type { AgentCardProps, AgentEditableField } from "./agent-card.types";
import {
	buildAgentFieldPatch,
	getAgentFieldValue,
	getPreviewNoPromptCommand,
	getPreviewPrompt,
	getPreviewTaskCommand,
} from "./agent-card.utils";
import { AgentCardActions } from "./components/AgentCardActions";
import { AgentCardFields } from "./components/AgentCardFields";
import { AgentCardHeader } from "./components/AgentCardHeader";
import { AgentCardPreview } from "./components/AgentCardPreview";

export function AgentCard({
	preset,
	showEnabled,
	showCommands,
	showTaskPrompts,
}: AgentCardProps) {
	const utils = electronTrpc.useUtils();
	const isCustomTerminalAgent =
		preset.source === "user" && preset.kind === "terminal";
	const updatePreset = electronTrpc.settings.updateAgentPreset.useMutation({
		onSuccess: async () => {
			await utils.settings.getAgentPresets.invalidate();
		},
	});
	const updateCustomAgent = electronTrpc.settings.updateCustomAgent.useMutation(
		{
			onSuccess: async () => {
				await utils.settings.getAgentPresets.invalidate();
			},
		},
	);
	const resetPreset = electronTrpc.settings.resetAgentPreset.useMutation({
		onSuccess: async () => {
			await utils.settings.getAgentPresets.invalidate();
		},
	});
	const [isOpen, setIsOpen] = useState(false);
	const [showPreview, setShowPreview] = useState(false);
	const [inputVersion, setInputVersion] = useState(0);
	const [validationMessage, setValidationMessage] = useState<string | null>(
		null,
	);

	const previewPrompt = useMemo(() => getPreviewPrompt(preset), [preset]);
	const previewNoPromptCommand = useMemo(
		() => getPreviewNoPromptCommand(preset),
		[preset],
	);
	const previewTaskCommand = useMemo(
		() => getPreviewTaskCommand(preset),
		[preset],
	);

	const handleOpenChange = (open: boolean) => {
		setIsOpen(open);
		if (!open) {
			setShowPreview(false);
		}
	};

	const resetFieldInputs = () => {
		setInputVersion((current) => current + 1);
	};

	const isMutating =
		updatePreset.isPending ||
		updateCustomAgent.isPending ||
		resetPreset.isPending;

	const mergePresetPatch = (
		currentPreset: ResolvedAgentConfig,
		patch: AgentPresetPatch,
	): ResolvedAgentConfig => {
		if (currentPreset.kind === "terminal") {
			return {
				...currentPreset,
				enabled: patch.enabled ?? currentPreset.enabled,
				label: patch.label ?? currentPreset.label,
				description:
					patch.description !== undefined
						? (patch.description ?? undefined)
						: currentPreset.description,
				command: patch.command ?? currentPreset.command,
				promptCommand: patch.promptCommand ?? currentPreset.promptCommand,
				promptCommandSuffix:
					patch.promptCommandSuffix !== undefined
						? (patch.promptCommandSuffix ?? undefined)
						: currentPreset.promptCommandSuffix,
				taskPromptTemplate:
					patch.taskPromptTemplate ?? currentPreset.taskPromptTemplate,
			};
		}

		return {
			...currentPreset,
			enabled: patch.enabled ?? currentPreset.enabled,
			label: patch.label ?? currentPreset.label,
			description:
				patch.description !== undefined
					? (patch.description ?? undefined)
					: currentPreset.description,
			taskPromptTemplate:
				patch.taskPromptTemplate ?? currentPreset.taskPromptTemplate,
			model:
				patch.model !== undefined
					? (patch.model ?? undefined)
					: currentPreset.model,
		};
	};

	const applyPatch = async (patch: AgentPresetPatch) => {
		utils.settings.getAgentPresets.setData(undefined, (currentPresets) =>
			currentPresets?.map((candidate) =>
				candidate.id === preset.id
					? mergePresetPatch(candidate, patch)
					: candidate,
			),
		);

		try {
			const updatedPreset = isCustomTerminalAgent
				? await updateCustomAgent.mutateAsync({
						id: preset.id,
						patch: {
							enabled: patch.enabled,
							label: patch.label,
							description: patch.description,
							command: patch.command,
							promptCommand: patch.promptCommand,
							promptCommandSuffix: patch.promptCommandSuffix,
							taskPromptTemplate: patch.taskPromptTemplate,
						},
					})
				: await updatePreset.mutateAsync({
						id: preset.id,
						patch,
					});
			if (updatedPreset) {
				utils.settings.getAgentPresets.setData(undefined, (currentPresets) =>
					currentPresets?.map((candidate) =>
						candidate.id === preset.id ? updatedPreset : candidate,
					),
				);
			}
			setValidationMessage(null);
		} catch (error) {
			await utils.settings.getAgentPresets.invalidate();
			resetFieldInputs();
			toast.error(
				error instanceof Error
					? error.message
					: "Failed to update agent settings",
			);
		}
	};

	const handleEnabledChange = async (enabled: boolean) => {
		await applyPatch({ enabled });
	};

	const handleFieldBlur = async (
		field: AgentEditableField,
		nextValue: string,
	) => {
		if (nextValue === getAgentFieldValue(preset, field)) {
			setValidationMessage(null);
			return;
		}

		const result = buildAgentFieldPatch({
			preset,
			field,
			value: nextValue,
		});
		if ("error" in result) {
			setValidationMessage(result.error);
			resetFieldInputs();
			return;
		}

		await applyPatch(result.patch);
	};

	const handleReset = async () => {
		try {
			await resetPreset.mutateAsync({ id: preset.id });
			await utils.settings.getAgentPresets.fetch();
			resetFieldInputs();
			setShowPreview(false);
			setValidationMessage(null);
			toast.success(`${preset.label} reset to defaults`);
		} catch (error) {
			toast.error(
				error instanceof Error
					? error.message
					: "Failed to reset agent settings",
			);
		}
	};

	return (
		<Card className="p-0">
			<Collapsible open={isOpen} onOpenChange={handleOpenChange}>
				<AgentCardHeader
					preset={preset}
					isOpen={isOpen}
					showEnabled={showEnabled}
					enabled={preset.enabled}
					isUpdatingEnabled={isMutating}
					onEnabledChange={handleEnabledChange}
					onToggle={() => handleOpenChange(!isOpen)}
				/>
				<CollapsibleContent id={`${preset.id}-settings`}>
					<CardContent className="space-y-4">
						<AgentCardFields
							preset={preset}
							inputVersion={inputVersion}
							showCommands={showCommands}
							showTaskPrompts={showTaskPrompts}
							validationMessage={validationMessage}
							onFieldBlur={handleFieldBlur}
						/>
						<AgentCardPreview
							preset={preset}
							showPreview={showPreview}
							previewPrompt={previewPrompt}
							previewNoPromptCommand={previewNoPromptCommand}
							previewTaskCommand={previewTaskCommand}
							onToggle={() => setShowPreview((current) => !current)}
						/>
					</CardContent>
					{preset.source === "builtin" && (
						<AgentCardActions isResetting={isMutating} onReset={handleReset} />
					)}
				</CollapsibleContent>
			</Collapsible>
		</Card>
	);
}
