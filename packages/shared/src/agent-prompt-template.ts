import type { TaskInput } from "./agent-command";

// ---------------------------------------------------------------------------
// Generic template rendering
// ---------------------------------------------------------------------------

/**
 * Render a Mustache-lite template with `{{var}}` placeholders.
 *
 * - Unknown variables are left intact (task templates rely on this so
 *   typos surface at validate-time instead of silently dropping).
 * - Empty-string values substitute in (so `{{tasks}}` with no tasks
 *   collapses cleanly instead of leaving the placeholder visible).
 * - Runs of 3+ newlines collapse to 2, and the result is trimmed, so
 *   templates with empty variables don't produce huge gaps.
 */
export function renderPromptTemplate(
	template: string,
	variables: Record<string, string>,
): string {
	return substituteOwnProperties(template, variables)
		.replace(/\n{3,}/g, "\n\n")
		.trim();
}

/**
 * Placeholder substitution that only reads OWN properties of the
 * variables object. Prevents `{{toString}}` and other inherited
 * property names from resolving through the prototype chain.
 */
function substituteOwnProperties(
	template: string,
	variables: Record<string, string>,
): string {
	return template.replace(
		/\{\{\s*([^}]+?)\s*\}\}/g,
		(match, rawKey: string) => {
			const key = rawKey.trim();
			if (!Object.hasOwn(variables, key)) return match;
			return variables[key] ?? match;
		},
	);
}

// ---------------------------------------------------------------------------
// Task prompt variables (unchanged from v1 — used by the task-run flow)
// ---------------------------------------------------------------------------

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

/**
 * Shim preserved so the existing task-run flow keeps working unchanged.
 * New callers should prefer `renderPromptTemplate` directly.
 *
 * Matches V1 semantics exactly: own-property substitution + trim.
 * Does NOT apply the generic's 3+-newline collapse pass — task
 * templates may rely on intentional blank lines.
 */
export function renderTaskPromptTemplate(
	template: string,
	task: TaskInput,
): string {
	return substituteOwnProperties(template, getTaskPromptVariables(task)).trim();
}

export function getSupportedTaskPromptVariables(): AgentTaskPromptVariable[] {
	return [...AGENT_TASK_PROMPT_VARIABLES];
}

export function validateTaskPromptTemplate(template: string): {
	valid: boolean;
	unknownVariables: string[];
} {
	return validateTemplate(template, AGENT_TASK_PROMPT_VARIABLES);
}

// ---------------------------------------------------------------------------
// Context prompt variables (new — used by V2 launch composition)
// ---------------------------------------------------------------------------

export const AGENT_CONTEXT_PROMPT_VARIABLES = [
	"userPrompt",
	"tasks",
	"issues",
	"prs",
	"attachments",
] as const;

export type AgentContextPromptVariable =
	(typeof AGENT_CONTEXT_PROMPT_VARIABLES)[number];

export function getSupportedContextPromptVariables(): AgentContextPromptVariable[] {
	return [...AGENT_CONTEXT_PROMPT_VARIABLES];
}

export function validateContextPromptTemplate(template: string): {
	valid: boolean;
	unknownVariables: string[];
} {
	return validateTemplate(template, AGENT_CONTEXT_PROMPT_VARIABLES);
}

/**
 * Default context templates. Plain markdown — works for every agent
 * (Claude, Codex, Cursor, custom). Users can override per-agent in
 * settings if they want XML or other wrapping.
 *
 * System is empty by default — agent harnesses (Claude CLI, Codex, etc.)
 * discover their own instructions files from the worktree.
 */
export const DEFAULT_CONTEXT_PROMPT_TEMPLATE_SYSTEM = "";

export const DEFAULT_CONTEXT_PROMPT_TEMPLATE_USER = `{{userPrompt}}

{{tasks}}

{{issues}}

{{prs}}

{{attachments}}`;

// ---------------------------------------------------------------------------
// Shared validator
// ---------------------------------------------------------------------------

function validateTemplate(
	template: string,
	known: readonly string[],
): { valid: boolean; unknownVariables: string[] } {
	const unknownVariables = Array.from(
		new Set(
			Array.from(template.matchAll(/\{\{([^}]+)\}\}/g))
				.map((match) => match[1]?.trim())
				.filter(
					(value): value is string =>
						!!value && !(known as readonly string[]).includes(value),
				),
		),
	);

	return {
		valid: unknownVariables.length === 0,
		unknownVariables,
	};
}
