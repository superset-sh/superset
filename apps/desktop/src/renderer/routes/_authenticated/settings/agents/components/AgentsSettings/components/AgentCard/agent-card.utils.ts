import {
	buildFileCommandFromAgentConfig,
	type ChatResolvedAgentConfig,
	type ResolvedAgentConfig,
	renderTaskPromptTemplate,
	type TerminalResolvedAgentConfig,
	validateTaskPromptTemplate,
} from "shared/utils/agent-settings";
import type { AgentDraft } from "./agent-card.types";

const SAMPLE_TASK = {
	id: "task_agent_settings",
	slug: "desktop-agent-settings",
	title: "Desktop agent settings",
	description: "Implement the desktop agent settings architecture.",
	priority: "high",
	statusName: "Todo",
	labels: ["desktop", "agents"],
};

export function toDraft(preset: ResolvedAgentConfig): AgentDraft {
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

export function areDraftsEqual(a: AgentDraft, b: AgentDraft): boolean {
	return JSON.stringify(a) === JSON.stringify(b);
}

export function getPreviewPrompt(taskPromptTemplate: string): string {
	return renderTaskPromptTemplate(taskPromptTemplate, SAMPLE_TASK);
}

export function getPreviewNoPromptCommand(
	preset: ResolvedAgentConfig,
	draft: AgentDraft,
): string {
	if (preset.kind !== "terminal") {
		return "Superset Chat opens a chat pane without a shell command.";
	}

	return (
		toTerminalPreviewConfig(preset, draft).command.trim() ||
		"No command configured."
	);
}

export function getPreviewTaskCommand(
	preset: ResolvedAgentConfig,
	draft: AgentDraft,
): string {
	if (preset.kind !== "terminal") {
		const config = toChatPreviewConfig(preset, draft);
		return config.model
			? `Superset Chat opens with model ${config.model}.`
			: "Superset Chat opens with the rendered task prompt.";
	}

	return (
		buildFileCommandFromAgentConfig({
			filePath: `.superset/task-${SAMPLE_TASK.slug}.md`,
			config: toTerminalPreviewConfig(preset, draft),
		}) ?? "No prompt-capable command configured."
	);
}

export function validateAgentDraft(
	preset: ResolvedAgentConfig,
	draft: AgentDraft,
): string | null {
	if (!draft.label.trim()) {
		return "Label is required.";
	}

	if (preset.kind === "terminal") {
		if (!draft.command.trim()) {
			return "Command is required for terminal agents.";
		}
		if (!draft.promptCommand.trim()) {
			return "Prompt command is required for terminal agents.";
		}
	}

	if (!draft.taskPromptTemplate.trim()) {
		return "Task prompt template is required.";
	}

	const templateValidation = validateTaskPromptTemplate(
		draft.taskPromptTemplate,
	);
	if (!templateValidation.valid) {
		return `Unknown variables: ${templateValidation.unknownVariables.join(", ")}`;
	}

	return null;
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
