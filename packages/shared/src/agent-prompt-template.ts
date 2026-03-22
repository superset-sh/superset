import type { TaskInput } from "./agent-command";

export const AGENT_TASK_PROMPT_VARIABLES = [
	"id",
	"slug",
	"title",
	"description",
	"priority",
	"statusName",
	"labels",
] as const;

export type AgentTaskPromptVariable =
	(typeof AGENT_TASK_PROMPT_VARIABLES)[number];

export const DEFAULT_TERMINAL_TASK_PROMPT_TEMPLATE = `Task: "{{title}}" ({{slug}})
Priority: {{priority}}
Status: {{statusName}}
Labels: {{labels}}

{{description}}

Work in the current workspace. Inspect the relevant code, make the needed changes, verify them when practical, and update task "{{id}}" with a short summary when done.`;

export const DEFAULT_CHAT_TASK_PROMPT_TEMPLATE = `Task: "{{title}}" ({{slug}})
Priority: {{priority}}
Status: {{statusName}}
Labels: {{labels}}

{{description}}

Help with this task in the current workspace and take the next concrete step.`;

type TaskPromptVariables = Record<AgentTaskPromptVariable, string>;

function getTaskPromptVariables(task: TaskInput): TaskPromptVariables {
	return {
		id: task.id,
		slug: task.slug,
		title: task.title,
		description: task.description || "No description provided.",
		priority: task.priority,
		statusName: task.statusName ?? "Unknown",
		labels: task.labels?.length ? task.labels.join(", ") : "None",
	};
}

export function renderTaskPromptTemplate(
	template: string,
	task: TaskInput,
): string {
	const variables = getTaskPromptVariables(task);

	return template
		.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (match, rawKey: string) => {
			const key = rawKey.trim() as AgentTaskPromptVariable;
			return variables[key] ?? match;
		})
		.trim();
}

export function getSupportedTaskPromptVariables(): AgentTaskPromptVariable[] {
	return [...AGENT_TASK_PROMPT_VARIABLES];
}

export function validateTaskPromptTemplate(template: string): {
	valid: boolean;
	unknownVariables: string[];
} {
	const unknownVariables = Array.from(
		new Set(
			Array.from(template.matchAll(/\{\{([^}]+)\}\}/g))
				.map((match) => match[1]?.trim())
				.filter(
					(value): value is string =>
						!!value &&
						!(AGENT_TASK_PROMPT_VARIABLES as readonly string[]).includes(value),
				),
		),
	);

	return {
		valid: unknownVariables.length === 0,
		unknownVariables,
	};
}
