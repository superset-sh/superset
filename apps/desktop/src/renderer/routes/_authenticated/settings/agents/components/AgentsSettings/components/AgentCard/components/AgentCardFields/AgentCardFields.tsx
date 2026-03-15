import { Input } from "@superset/ui/input";
import { Label } from "@superset/ui/label";
import { Textarea } from "@superset/ui/textarea";
import type { ResolvedAgentConfig } from "shared/utils/agent-settings";
import type { AgentDraft } from "../../agent-card.types";

interface AgentCardFieldsProps {
	preset: ResolvedAgentConfig;
	draft: AgentDraft;
	showCommands: boolean;
	showTaskPrompts: boolean;
	validationMessage: string | null;
	onDraftChange: (patch: Partial<AgentDraft>) => void;
}

export function AgentCardFields({
	preset,
	draft,
	showCommands,
	showTaskPrompts,
	validationMessage,
	onDraftChange,
}: AgentCardFieldsProps) {
	return (
		<>
			<div className="grid gap-4 md:grid-cols-2">
				<div className="space-y-2">
					<Label htmlFor={`${preset.id}-label`}>Label</Label>
					<Input
						id={`${preset.id}-label`}
						value={draft.label}
						onChange={(event) => onDraftChange({ label: event.target.value })}
					/>
				</div>
				<div className="space-y-2">
					<Label htmlFor={`${preset.id}-description`}>Description</Label>
					<Input
						id={`${preset.id}-description`}
						value={draft.description}
						onChange={(event) =>
							onDraftChange({ description: event.target.value })
						}
					/>
				</div>
			</div>

			{showCommands && preset.kind === "terminal" && (
				<div className="grid gap-4 md:grid-cols-2">
					<div className="space-y-2">
						<Label htmlFor={`${preset.id}-command`}>Command (No Prompt)</Label>
						<Input
							id={`${preset.id}-command`}
							value={draft.command}
							onChange={(event) =>
								onDraftChange({ command: event.target.value })
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
								onDraftChange({ promptCommand: event.target.value })
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
								onDraftChange({ promptCommandSuffix: event.target.value })
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
							onDraftChange({ taskPromptTemplate: event.target.value })
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
						onChange={(event) => onDraftChange({ model: event.target.value })}
						placeholder="Optional model id"
					/>
				</div>
			)}

			{validationMessage && (
				<p className="text-sm text-destructive">{validationMessage}</p>
			)}
		</>
	);
}
