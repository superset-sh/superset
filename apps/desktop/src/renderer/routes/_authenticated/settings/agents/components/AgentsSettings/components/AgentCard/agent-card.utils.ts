import {
	type AgentPresetPatch,
	buildFileCommandFromAgentConfig,
	type ResolvedAgentConfig,
	renderTaskPromptTemplate,
	validateTaskPromptTemplate,
} from "shared/utils/agent-settings";
import type { AgentEditableField } from "./agent-card.types";

const SAMPLE_TASK = {
	id: "task_agent_settings",
	slug: "desktop-agent-settings",
	title: "Desktop agent settings",
	description: "Implement the desktop agent settings architecture.",
	priority: "high",
	statusName: "Todo",
	labels: ["desktop", "agents"],
};

export function getPreviewPrompt(preset: ResolvedAgentConfig): string {
	return renderTaskPromptTemplate(preset.taskPromptTemplate, SAMPLE_TASK);
}

export function getPreviewNoPromptCommand(preset: ResolvedAgentConfig): string {
	if (preset.kind !== "terminal") {
		return "Superset Chat opens a chat pane without a shell command.";
	}

	return preset.command.trim() || "No command configured.";
}

export function getPreviewTaskCommand(preset: ResolvedAgentConfig): string {
	if (preset.kind !== "terminal") {
		return preset.model
			? `Superset Chat opens with model ${preset.model}.`
			: "Superset Chat opens with the rendered task prompt.";
	}

	return (
		buildFileCommandFromAgentConfig({
			filePath: `.superset/task-${SAMPLE_TASK.slug}.md`,
			config: preset,
		}) ?? "No prompt-capable command configured."
	);
}

export function getAgentFieldValue(
	preset: ResolvedAgentConfig,
	field: AgentEditableField,
): string {
	switch (field) {
		case "label":
			return preset.label;
		case "description":
			return preset.description ?? "";
		case "command":
			return preset.kind === "terminal" ? preset.command : "";
		case "promptCommand":
			return preset.kind === "terminal" ? preset.promptCommand : "";
		case "promptCommandSuffix":
			return preset.kind === "terminal"
				? (preset.promptCommandSuffix ?? "")
				: "";
		case "taskPromptTemplate":
			return preset.taskPromptTemplate;
		case "model":
			return preset.kind === "chat" ? (preset.model ?? "") : "";
	}
}

export function buildAgentFieldPatch({
	preset,
	field,
	value,
}: {
	preset: ResolvedAgentConfig;
	field: AgentEditableField;
	value: string;
}): { patch: AgentPresetPatch } | { error: string } {
	switch (field) {
		case "label":
			if (!value.trim()) {
				return { error: "Label is required." };
			}
			return { patch: { label: value } };
		case "description":
			return { patch: { description: value || null } };
		case "command":
			if (preset.kind !== "terminal") {
				return { error: "Command is only available for terminal agents." };
			}
			if (!value.trim()) {
				return { error: "Command is required for terminal agents." };
			}
			return { patch: { command: value } };
		case "promptCommand":
			if (preset.kind !== "terminal") {
				return {
					error: "Prompt command is only available for terminal agents.",
				};
			}
			if (!value.trim()) {
				return preset.source === "user"
					? { patch: { promptCommand: "" } }
					: { error: "Prompt command is required for terminal agents." };
			}
			return { patch: { promptCommand: value } };
		case "promptCommandSuffix":
			if (preset.kind !== "terminal") {
				return {
					error: "Prompt command suffix is only available for terminal agents.",
				};
			}
			return { patch: { promptCommandSuffix: value || null } };
		case "taskPromptTemplate": {
			if (!value.trim()) {
				return { error: "Task prompt template is required." };
			}
			const templateValidation = validateTaskPromptTemplate(value);
			if (!templateValidation.valid) {
				return {
					error: `Unknown variables: ${templateValidation.unknownVariables.join(", ")}`,
				};
			}
			return { patch: { taskPromptTemplate: value } };
		}
		case "model":
			if (preset.kind !== "chat") {
				return { error: "Model override is only available for chat agents." };
			}
			return { patch: { model: value || null } };
	}
}
