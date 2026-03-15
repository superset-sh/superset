import {
	DEFAULT_TERMINAL_TASK_PROMPT_TEMPLATE,
	renderTaskPromptTemplate,
} from "./agent-prompt-template";

export const AGENT_TYPES = [
	"claude",
	"codex",
	"gemini",
	"opencode",
	"copilot",
	"cursor-agent",
] as const;

export type AgentType = (typeof AGENT_TYPES)[number];

export const AGENT_LABELS: Record<AgentType, string> = {
	claude: "Claude",
	codex: "Codex",
	gemini: "Gemini",
	opencode: "OpenCode",
	copilot: "Copilot",
	"cursor-agent": "Cursor Agent",
};

export const AGENT_PRESET_COMMANDS: Record<AgentType, string[]> = {
	claude: ["claude --dangerously-skip-permissions"],
	codex: [
		'codex -c model_reasoning_effort="high" --dangerously-bypass-approvals-and-sandbox -c model_reasoning_summary="detailed" -c model_supports_reasoning_summaries=true',
	],
	gemini: ["gemini --yolo"],
	opencode: ["opencode"],
	copilot: ["copilot --allow-all"],
	"cursor-agent": ["cursor-agent"],
};

export const AGENT_PRESET_DESCRIPTIONS: Record<AgentType, string> = {
	claude: "Danger mode: All permissions auto-approved",
	codex: "Danger mode: All permissions auto-approved",
	gemini: "Danger mode: All permissions auto-approved",
	opencode: "OpenCode: Open-source AI coding agent",
	copilot: "Danger mode: All permissions auto-approved",
	"cursor-agent": "Cursor AI agent for terminal-based coding assistance",
};

export interface AgentPromptCommandDefaults {
	command: string;
	suffix?: string;
}

export const AGENT_PROMPT_COMMANDS: Record<
	AgentType,
	AgentPromptCommandDefaults
> = {
	claude: {
		command: AGENT_PRESET_COMMANDS.claude[0] ?? "claude",
	},
	codex: {
		command: `${AGENT_PRESET_COMMANDS.codex[0] ?? "codex"} --`,
	},
	gemini: {
		command: "gemini",
		suffix: "--yolo",
	},
	opencode: {
		command: "opencode --prompt",
	},
	copilot: {
		command: "copilot -i --allow-all",
		suffix: "--yolo",
	},
	"cursor-agent": {
		command: AGENT_PRESET_COMMANDS["cursor-agent"][0] ?? "cursor-agent",
		suffix: "--yolo",
	},
};

export interface TaskInput {
	id: string;
	slug: string;
	title: string;
	description: string | null;
	priority: string;
	statusName: string | null;
	labels: string[] | null;
}

export function buildAgentTaskPrompt(task: TaskInput): string {
	return renderTaskPromptTemplate(DEFAULT_TERMINAL_TASK_PROMPT_TEMPLATE, task);
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

function buildFileCommand(
	filePath: string,
	command: string,
	suffix?: string,
): string {
	const escapedPath = filePath.replaceAll("'", "'\\''");
	return `${command} "$(cat '${escapedPath}')"${suffix ? ` ${suffix}` : ""}`;
}

export function buildAgentFileCommand({
	filePath,
	agent = "claude",
}: {
	filePath: string;
	agent?: AgentType;
}): string {
	const promptCommand = AGENT_PROMPT_COMMANDS[agent];
	return buildFileCommand(
		filePath,
		promptCommand.command,
		promptCommand.suffix,
	);
}

export function buildAgentPromptCommand({
	prompt,
	randomId,
	agent = "claude",
}: {
	prompt: string;
	randomId: string;
	agent?: AgentType;
}): string {
	let delimiter = `SUPERSET_PROMPT_${randomId.replaceAll("-", "")}`;
	while (prompt.includes(delimiter)) {
		delimiter = `${delimiter}_X`;
	}
	const promptCommand = AGENT_PROMPT_COMMANDS[agent];
	return buildHeredoc(
		prompt,
		delimiter,
		promptCommand.command,
		promptCommand.suffix,
	);
}

export function buildAgentCommand({
	task,
	randomId,
	agent = "claude",
}: {
	task: TaskInput;
	randomId: string;
	agent?: AgentType;
}): string {
	const prompt = buildAgentTaskPrompt(task);
	return buildAgentPromptCommand({ prompt, randomId, agent });
}

/** @deprecated Use `buildAgentCommand` instead */
export function buildClaudeCommand({
	task,
	randomId,
}: {
	task: TaskInput;
	randomId: string;
}): string {
	return buildAgentCommand({ task, randomId, agent: "claude" });
}
