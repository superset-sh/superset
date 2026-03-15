import { Badge } from "@superset/ui/badge";
import { Button } from "@superset/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardFooter,
	CardHeader,
	CardTitle,
} from "@superset/ui/card";
import { Input } from "@superset/ui/input";
import { Label } from "@superset/ui/label";
import { toast } from "@superset/ui/sonner";
import { Switch } from "@superset/ui/switch";
import { Textarea } from "@superset/ui/textarea";
import { useEffect, useMemo, useState } from "react";
import {
	getPresetIcon,
	useIsDarkTheme,
} from "renderer/assets/app-icons/preset-icons";
import { electronTrpc } from "renderer/lib/electron-trpc";
import {
	buildFileCommandFromAgentConfig,
	type ChatResolvedAgentConfig,
	type ResolvedAgentConfig,
	renderTaskPromptTemplate,
	type TerminalResolvedAgentConfig,
	validateTaskPromptTemplate,
} from "shared/utils/agent-settings";

const SAMPLE_TASK = {
	id: "task_agent_settings",
	slug: "desktop-agent-settings",
	title: "Desktop agent settings",
	description: "Implement the desktop agent settings architecture.",
	priority: "high",
	statusName: "Todo",
	labels: ["desktop", "agents"],
};

type AgentDraft = {
	enabled: boolean;
	label: string;
	description: string;
	command: string;
	promptCommand: string;
	promptCommandSuffix: string;
	taskPromptTemplate: string;
	model: string;
};

function toDraft(preset: ResolvedAgentConfig): AgentDraft {
	return {
		enabled: preset.enabled,
		label: preset.label,
		description: preset.description ?? "",
		command: preset.kind === "terminal" ? preset.command : "",
		promptCommand: preset.kind === "terminal" ? preset.promptCommand : "",
		promptCommandSuffix:
			preset.kind === "terminal" ? (preset.promptCommandSuffix ?? "") : "",
		taskPromptTemplate: preset.taskPromptTemplate,
		model: preset.kind === "chat" ? (preset.model ?? "") : "",
	};
}

function areDraftsEqual(a: AgentDraft, b: AgentDraft): boolean {
	return JSON.stringify(a) === JSON.stringify(b);
}

function toTerminalPreviewConfig(
	preset: TerminalResolvedAgentConfig,
	draft: AgentDraft,
): TerminalResolvedAgentConfig {
	return {
		...preset,
		enabled: draft.enabled,
		label: draft.label,
		description: draft.description || undefined,
		command: draft.command,
		promptCommand: draft.promptCommand,
		promptCommandSuffix: draft.promptCommandSuffix || undefined,
		taskPromptTemplate: draft.taskPromptTemplate,
	};
}

function toChatPreviewConfig(
	preset: ChatResolvedAgentConfig,
	draft: AgentDraft,
): ChatResolvedAgentConfig {
	return {
		...preset,
		enabled: draft.enabled,
		label: draft.label,
		description: draft.description || undefined,
		taskPromptTemplate: draft.taskPromptTemplate,
		model: draft.model || undefined,
	};
}

interface AgentCardProps {
	preset: ResolvedAgentConfig;
	showEnabled: boolean;
	showCommands: boolean;
	showTaskPrompts: boolean;
}

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
	const [validationMessage, setValidationMessage] = useState<string | null>(
		null,
	);
	const isDark = useIsDarkTheme();

	useEffect(() => {
		setDraft(toDraft(preset));
		setValidationMessage(null);
	}, [preset]);

	const savedDraft = useMemo(() => toDraft(preset), [preset]);
	const isDirty = !areDraftsEqual(savedDraft, draft);
	const previewPrompt = useMemo(
		() => renderTaskPromptTemplate(draft.taskPromptTemplate, SAMPLE_TASK),
		[draft.taskPromptTemplate],
	);
	const previewNoPromptCommand = useMemo(() => {
		if (preset.kind !== "terminal") {
			return "Superset Chat opens a chat pane without a shell command.";
		}

		const config = toTerminalPreviewConfig(preset, draft);
		return config.command.trim() || "No command configured.";
	}, [draft, preset]);
	const previewTaskCommand = useMemo(() => {
		if (preset.kind !== "terminal") {
			const config = toChatPreviewConfig(preset, draft);
			return config.model
				? `Superset Chat opens with model ${config.model}.`
				: "Superset Chat opens with the rendered task prompt.";
		}

		const config = toTerminalPreviewConfig(preset, draft);
		return (
			buildFileCommandFromAgentConfig({
				filePath: `.superset/task-${SAMPLE_TASK.slug}.md`,
				config,
			}) ?? "No prompt-capable command configured."
		);
	}, [draft, preset]);
	const icon = getPresetIcon(preset.id, isDark);

	const handleSave = async () => {
		if (!draft.label.trim()) {
			setValidationMessage("Label is required.");
			return;
		}
		if (preset.kind === "terminal") {
			if (!draft.command.trim()) {
				setValidationMessage("Command is required for terminal agents.");
				return;
			}
			if (!draft.promptCommand.trim()) {
				setValidationMessage("Prompt command is required for terminal agents.");
				return;
			}
		}
		if (!draft.taskPromptTemplate.trim()) {
			setValidationMessage("Task prompt template is required.");
			return;
		}
		const templateValidation = validateTaskPromptTemplate(
			draft.taskPromptTemplate,
		);
		if (!templateValidation.valid) {
			setValidationMessage(
				`Unknown variables: ${templateValidation.unknownVariables.join(", ")}`,
			);
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
			<CardHeader>
				<div className="flex items-center gap-3">
					{icon ? (
						<img src={icon} alt="" className="size-8 object-contain" />
					) : (
						<div className="size-8 rounded-lg bg-muted" />
					)}
					<div className="min-w-0">
						<CardTitle className="truncate">{preset.label}</CardTitle>
						<CardDescription className="mt-1">
							{preset.kind === "chat"
								? "Chat launch configuration"
								: "Terminal launch configuration"}
						</CardDescription>
					</div>
				</div>
				{preset.overriddenFields.length > 0 && (
					<div className="flex flex-wrap gap-1">
						{preset.overriddenFields.map((field) => (
							<Badge key={field} variant="secondary">
								{field}
							</Badge>
						))}
					</div>
				)}
			</CardHeader>
			<CardContent className="space-y-4">
				{showEnabled && (
					<div className="flex items-center justify-between">
						<div className="space-y-0.5">
							<Label htmlFor={`${preset.id}-enabled`}>Enabled</Label>
							<p className="text-xs text-muted-foreground">
								Show this agent in workspace launchers
							</p>
						</div>
						<Switch
							id={`${preset.id}-enabled`}
							checked={draft.enabled}
							onCheckedChange={(enabled) =>
								setDraft((current) => ({ ...current, enabled }))
							}
						/>
					</div>
				)}

				<div className="grid gap-4 md:grid-cols-2">
					<div className="space-y-2">
						<Label htmlFor={`${preset.id}-label`}>Label</Label>
						<Input
							id={`${preset.id}-label`}
							value={draft.label}
							onChange={(event) =>
								setDraft((current) => ({
									...current,
									label: event.target.value,
								}))
							}
						/>
					</div>
					<div className="space-y-2">
						<Label htmlFor={`${preset.id}-description`}>Description</Label>
						<Input
							id={`${preset.id}-description`}
							value={draft.description}
							onChange={(event) =>
								setDraft((current) => ({
									...current,
									description: event.target.value,
								}))
							}
						/>
					</div>
				</div>

				{showCommands && preset.kind === "terminal" && (
					<div className="grid gap-4 md:grid-cols-2">
						<div className="space-y-2">
							<Label htmlFor={`${preset.id}-command`}>
								Command (No Prompt)
							</Label>
							<Input
								id={`${preset.id}-command`}
								value={draft.command}
								onChange={(event) =>
									setDraft((current) => ({
										...current,
										command: event.target.value,
									}))
								}
							/>
						</div>
						<div className="space-y-2">
							<Label htmlFor={`${preset.id}-prompt-command`}>
								Command (With Prompt)
							</Label>
							<Input
								id={`${preset.id}-prompt-command`}
								value={draft.promptCommand}
								onChange={(event) =>
									setDraft((current) => ({
										...current,
										promptCommand: event.target.value,
									}))
								}
							/>
						</div>
						<div className="space-y-2 md:col-span-2">
							<Label htmlFor={`${preset.id}-prompt-command-suffix`}>
								Prompt Command Suffix
							</Label>
							<Input
								id={`${preset.id}-prompt-command-suffix`}
								value={draft.promptCommandSuffix}
								onChange={(event) =>
									setDraft((current) => ({
										...current,
										promptCommandSuffix: event.target.value,
									}))
								}
								placeholder="Optional flags appended after the prompt payload"
							/>
						</div>
					</div>
				)}

				{showTaskPrompts && (
					<div className="space-y-2">
						<Label htmlFor={`${preset.id}-task-template`}>
							Task Prompt Template
						</Label>
						<Textarea
							id={`${preset.id}-task-template`}
							value={draft.taskPromptTemplate}
							onChange={(event) =>
								setDraft((current) => ({
									...current,
									taskPromptTemplate: event.target.value,
								}))
							}
							className="min-h-40 font-mono text-xs"
						/>
					</div>
				)}

				{preset.kind === "chat" && (
					<div className="space-y-2">
						<Label htmlFor={`${preset.id}-model`}>Model Override</Label>
						<Input
							id={`${preset.id}-model`}
							value={draft.model}
							onChange={(event) =>
								setDraft((current) => ({
									...current,
									model: event.target.value,
								}))
							}
							placeholder="Optional model id"
						/>
					</div>
				)}

				<div className="space-y-3 rounded-lg border bg-muted/30 p-4">
					<div>
						<p className="text-sm font-medium">Preview</p>
						<p className="text-xs text-muted-foreground">
							Sample launch output for a representative task
						</p>
					</div>
					<div className="space-y-1">
						<p className="text-xs font-medium text-muted-foreground">
							Rendered Task Prompt
						</p>
						<pre className="whitespace-pre-wrap rounded-md bg-background p-3 text-xs">
							{previewPrompt}
						</pre>
					</div>
					<div className="space-y-1">
						<p className="text-xs font-medium text-muted-foreground">
							No-Prompt Launch
						</p>
						<pre className="whitespace-pre-wrap rounded-md bg-background p-3 text-xs">
							{previewNoPromptCommand}
						</pre>
					</div>
					<div className="space-y-1">
						<p className="text-xs font-medium text-muted-foreground">
							Task Launch
						</p>
						<pre className="whitespace-pre-wrap rounded-md bg-background p-3 text-xs">
							{previewTaskCommand}
						</pre>
					</div>
				</div>

				{validationMessage && (
					<p className="text-sm text-destructive">{validationMessage}</p>
				)}
			</CardContent>
			<CardFooter className="justify-end gap-2">
				<Button
					variant="outline"
					onClick={handleReset}
					disabled={resetPreset.isPending}
				>
					Reset to Defaults
				</Button>
				<Button
					onClick={handleSave}
					disabled={!isDirty || updatePreset.isPending}
				>
					Save
				</Button>
			</CardFooter>
		</Card>
	);
}
