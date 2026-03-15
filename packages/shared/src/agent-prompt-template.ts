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

export const DEFAULT_TERMINAL_TASK_PROMPT_TEMPLATE = `You are working on task "{{title}}" ({{slug}}).

Priority: {{priority}}
Status: {{statusName}}
Labels: {{labels}}

## Task Description

{{description}}

## Instructions

You are running fully autonomously. Do not ask questions or wait for user feedback — make all decisions independently based on the codebase and task description.

1. Explore the codebase to understand the relevant code and architecture
2. Create a detailed execution plan for this task including:
   - Purpose and scope of the changes
   - Key assumptions
   - Concrete implementation steps with specific files to modify
   - How to validate the changes work correctly
3. Implement the plan
4. Verify your changes work correctly (run relevant tests, typecheck, lint)
5. When done, use the Superset MCP \`update_task\` tool to update task "{{id}}" with a summary of what was done`;

export const DEFAULT_CHAT_TASK_PROMPT_TEMPLATE = `You are helping with task "{{title}}" ({{slug}}).

Priority: {{priority}}
Status: {{statusName}}
Labels: {{labels}}

## Task Description

{{description}}

Help with this task in the current workspace. Start by summarizing the goal, then take the next concrete step.`;

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
		.replace(
			/\{\{(id|slug|title|description|priority|statusName|labels)\}\}/g,
			(match, key: AgentTaskPromptVariable) => variables[key] ?? match,
		)
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
