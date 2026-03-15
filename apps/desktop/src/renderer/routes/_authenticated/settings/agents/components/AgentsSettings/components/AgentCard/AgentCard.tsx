import { Card, CardContent } from "@superset/ui/card";
import { Collapsible, CollapsibleContent } from "@superset/ui/collapsible";
import { toast } from "@superset/ui/sonner";
import { useEffect, useMemo, useState } from "react";
import { electronTrpc } from "renderer/lib/electron-trpc";
import type { AgentCardProps, AgentDraft } from "./agent-card.types";
import {
	areDraftsEqual,
	getPreviewNoPromptCommand,
	getPreviewPrompt,
	getPreviewTaskCommand,
	toDraft,
	validateAgentDraft,
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
	const updatePreset = electronTrpc.settings.updateAgentPreset.useMutation({
		onSuccess: async () => {
			await utils.settings.getAgentPresets.invalidate();
		},
	});
	const resetPreset = electronTrpc.settings.resetAgentPreset.useMutation({
		onSuccess: async () => {
			await utils.settings.getAgentPresets.invalidate();
		},
	});
	const [draft, setDraft] = useState<AgentDraft>(() => toDraft(preset));
	const [isOpen, setIsOpen] = useState(false);
	const [showPreview, setShowPreview] = useState(false);
	const [validationMessage, setValidationMessage] = useState<string | null>(
		null,
	);

	useEffect(() => {
		setDraft(toDraft(preset));
		setIsOpen(false);
		setShowPreview(false);
		setValidationMessage(null);
	}, [preset]);

	const savedDraft = useMemo(() => toDraft(preset), [preset]);
	const isDirty = !areDraftsEqual(savedDraft, draft);
	const previewPrompt = useMemo(
		() => getPreviewPrompt(draft.taskPromptTemplate),
		[draft.taskPromptTemplate],
	);
	const previewNoPromptCommand = useMemo(
		() => getPreviewNoPromptCommand(preset, draft),
		[draft, preset],
	);
	const previewTaskCommand = useMemo(
		() => getPreviewTaskCommand(preset, draft),
		[draft, preset],
	);

	const updateDraft = (patch: Partial<AgentDraft>) => {
		setDraft((current) => ({ ...current, ...patch }));
	};
	const handleOpenChange = (open: boolean) => {
		setIsOpen(open);
		if (!open) {
			setShowPreview(false);
		}
	};

	const handleSave = async () => {
		const nextValidationMessage = validateAgentDraft(preset, draft);
		if (nextValidationMessage) {
			setValidationMessage(nextValidationMessage);
			return;
		}

		setValidationMessage(null);

		try {
			await updatePreset.mutateAsync({
				id: preset.id,
				patch: {
					enabled: draft.enabled,
					label: draft.label,
					description: draft.description || null,
					command: preset.kind === "terminal" ? draft.command : undefined,
					promptCommand:
						preset.kind === "terminal" ? draft.promptCommand : undefined,
					promptCommandSuffix:
						preset.kind === "terminal"
							? draft.promptCommandSuffix || null
							: undefined,
					taskPromptTemplate: draft.taskPromptTemplate,
					model: preset.kind === "chat" ? draft.model || null : undefined,
				},
			});
			toast.success(`${preset.label} settings updated`);
		} catch (error) {
			toast.error(
				error instanceof Error
					? error.message
					: "Failed to update agent settings",
			);
		}
	};

	const handleReset = async () => {
		try {
			await resetPreset.mutateAsync({ id: preset.id });
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
		<Card>
			<Collapsible open={isOpen} onOpenChange={handleOpenChange}>
				<AgentCardHeader
					preset={preset}
					isOpen={isOpen}
					showEnabled={showEnabled}
					enabled={draft.enabled}
					onEnabledChange={(enabled) => updateDraft({ enabled })}
					onToggle={() => handleOpenChange(!isOpen)}
				/>
				<CollapsibleContent id={`${preset.id}-settings`}>
					<CardContent className="space-y-4">
						<AgentCardFields
							preset={preset}
							draft={draft}
							showCommands={showCommands}
							showTaskPrompts={showTaskPrompts}
							validationMessage={validationMessage}
							onDraftChange={updateDraft}
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
					<AgentCardActions
						isDirty={isDirty}
						isUpdating={updatePreset.isPending}
						isResetting={resetPreset.isPending}
						onSave={handleSave}
						onReset={handleReset}
					/>
				</CollapsibleContent>
			</Collapsible>
		</Card>
	);
}
