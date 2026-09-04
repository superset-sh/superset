import { msg } from "@lingui/core/macro";
import { i18n } from "@superset/i18n";
import {
	type AgentPresetPatch,
	buildFileCommandFromAgentConfig,
	type ResolvedAgentConfig,
	renderTaskPromptTemplate,
	validateTaskPromptTemplate,
} from "@superset/shared/agent-settings";
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
	return (
		preset.command.trim() ||
		i18n._(
			msg({
				message: "No command configured.",
			}),
		)
	);
}

export function getPreviewTaskCommand(preset: ResolvedAgentConfig): string {
	return (
		buildFileCommandFromAgentConfig({
			filePath: `.superset/task-${SAMPLE_TASK.slug}.md`,
			config: preset,
		}) ??
		i18n._(
			msg({
				message: "No prompt-capable command configured.",
			}),
		)
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
				return {
					error: i18n._(
						msg({
							message: "Label is required.",
						}),
					),
				};
			}
			return { patch: { label: value } };
		case "description":
			return { patch: { description: value || null } };
		case "command":
			if (preset.kind !== "terminal") {
				return {
					error: i18n._(
						msg({
							message: "Command is only available for terminal agents.",
						}),
					),
				};
			}
			if (!value.trim()) {
				return {
					error: i18n._(
						msg({
							message: "Command is required for terminal agents.",
						}),
					),
				};
			}
			return { patch: { command: value } };
		case "promptCommand":
			if (preset.kind !== "terminal") {
				return {
					error: i18n._(
						msg({
							message: "Prompt command is only available for terminal agents.",
						}),
					),
				};
			}
			if (!value.trim()) {
				return preset.source === "user"
					? { patch: { promptCommand: "" } }
					: {
							error: i18n._(
								msg({
									message: "Prompt command is required for terminal agents.",
								}),
							),
						};
			}
			return { patch: { promptCommand: value } };
		case "promptCommandSuffix":
			if (preset.kind !== "terminal") {
				return {
					error: i18n._(
						msg({
							message:
								"Prompt command suffix is only available for terminal agents.",
						}),
					),
				};
			}
			return { patch: { promptCommandSuffix: value || null } };
		case "taskPromptTemplate": {
			if (!value.trim()) {
				return {
					error: i18n._(
						msg({
							message: "Task prompt template is required.",
						}),
					),
				};
			}
			const templateValidation = validateTaskPromptTemplate(value);
			if (!templateValidation.valid) {
				const unknownVariables = templateValidation.unknownVariables.join(", ");
				return {
					error: i18n._(
						msg({
							message: `Unknown variables: ${unknownVariables}`,
						}),
					),
				};
			}
			return { patch: { taskPromptTemplate: value } };
		}
	}
}
