import type { AgentPreset } from "@superset/local-db";
import {
	AGENT_LABELS,
	AGENT_PRESET_COMMANDS,
	AGENT_PRESET_DESCRIPTIONS,
	AGENT_PROMPT_COMMANDS,
	AGENT_TYPES,
	type AgentType,
	type TaskInput,
} from "@superset/shared/agent-command";
import {
	STARTABLE_AGENT_TYPES,
	type StartableAgentType,
} from "@superset/shared/agent-launch";

export const OPEN_AGENT_SETTINGS_OPTION = "__open-agent-settings__" as const;

export const DEFAULT_AGENT_TASK_PROMPT_TEMPLATE = `You are working on task "{{title}}" ({{slug}}).

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

function createDefaultAgentPreset(agent: AgentType): AgentPreset {
	const promptDefaults = AGENT_PROMPT_COMMANDS[agent];
	return {
		id: agent,
		label: AGENT_LABELS[agent],
		description: AGENT_PRESET_DESCRIPTIONS[agent],
		command: AGENT_PRESET_COMMANDS[agent][0] ?? "",
		promptCommand: promptDefaults.command,
		promptCommandSuffix: promptDefaults.suffix,
		taskPromptTemplate: DEFAULT_AGENT_TASK_PROMPT_TEMPLATE,
		enabled: true,
	};
}

const DEFAULT_AGENT_PRESETS_BY_ID: Record<AgentType, AgentPreset> = {
	claude: createDefaultAgentPreset("claude"),
	codex: createDefaultAgentPreset("codex"),
	gemini: createDefaultAgentPreset("gemini"),
	opencode: createDefaultAgentPreset("opencode"),
	copilot: createDefaultAgentPreset("copilot"),
	"cursor-agent": createDefaultAgentPreset("cursor-agent"),
};

export function getDefaultAgentPreset(agent: AgentType): AgentPreset {
	return { ...DEFAULT_AGENT_PRESETS_BY_ID[agent] };
}

export function getDefaultAgentPresets(): AgentPreset[] {
	return AGENT_TYPES.map((agent) => getDefaultAgentPreset(agent));
}

export function getSelectableStartableAgents(agentPresets: AgentPreset[]) {
	const enabledTerminalAgents =
		agentPresets.length > 0
			? agentPresets
					.filter((preset) => preset.enabled !== false)
					.map((preset) => preset.id as AgentType)
			: (STARTABLE_AGENT_TYPES.filter(
					(agent) => agent !== "superset-chat",
				) as AgentType[]);

	return [...enabledTerminalAgents, "superset-chat"] as StartableAgentType[];
}

export function getFallbackStartableAgent(
	selectableAgents: readonly StartableAgentType[],
): StartableAgentType {
	if (selectableAgents.includes("claude")) return "claude";
	return selectableAgents[0] ?? "superset-chat";
}

export function normalizeAgentPresets(
	presets: AgentPreset[] | null | undefined,
): AgentPreset[] {
	const presetsById = new Map(
		(presets ?? []).map((preset) => [preset.id, preset] as const),
	);

	return AGENT_TYPES.map((agent) => {
		const defaults = getDefaultAgentPreset(agent);
		const existing = presetsById.get(agent);
		if (!existing) return defaults;

		return {
			...defaults,
			...existing,
			id: agent,
			enabled: existing.enabled ?? defaults.enabled ?? true,
		};
	});
}

function buildHeredoc(
	prompt: string,
	delimiter: string,
	command: string,
	suffix?: string,
): string {
	const closing = suffix ? `)" ${suffix}` : ')"';
	return [
		`${command} "$(cat <<'${delimiter}'`,
		prompt,
		delimiter,
		closing,
	].join("\n");
}

export function buildPromptCommandFromAgentPreset({
	prompt,
	randomId,
	preset,
}: {
	prompt: string;
	randomId: string;
	preset: Pick<
		AgentPreset,
		"command" | "promptCommand" | "promptCommandSuffix"
	>;
}): string | null {
	const promptCommand = preset.promptCommand.trim() || preset.command.trim();
	if (!promptCommand) return null;

	let delimiter = `SUPERSET_PROMPT_${randomId.replaceAll("-", "")}`;
	while (prompt.includes(delimiter)) {
		delimiter = `${delimiter}_X`;
	}

	const suffix =
		preset.promptCommandSuffix && preset.promptCommandSuffix.trim().length > 0
			? preset.promptCommandSuffix.trim()
			: undefined;

	return buildHeredoc(prompt, delimiter, promptCommand, suffix);
}

export function getCommandFromAgentPreset(
	preset: Pick<AgentPreset, "command">,
) {
	const command = preset.command.trim();
	return command.length > 0 ? command : null;
}

type TaskPromptVariables = {
	id: string;
	slug: string;
	title: string;
	description: string;
	priority: string;
	statusName: string;
	labels: string;
};

export function renderTaskPromptTemplate(
	template: string,
	task: TaskInput,
): string {
	const variables: TaskPromptVariables = {
		id: task.id,
		slug: task.slug,
		title: task.title,
		description: task.description || "No description provided.",
		priority: task.priority,
		statusName: task.statusName ?? "Unknown",
		labels: task.labels?.length ? task.labels.join(", ") : "None",
	};

	return template
		.replace(
			/\{\{(id|slug|title|description|priority|statusName|labels)\}\}/g,
			(match, key: keyof TaskPromptVariables) => variables[key] ?? match,
		)
		.trim();
}
