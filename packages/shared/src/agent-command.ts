import {
	DEFAULT_TERMINAL_TASK_PROMPT_TEMPLATE,
	renderTaskPromptTemplate,
} from "./agent-prompt-template";

export const AGENT_TYPES = [
	"claude",
	"codex",
	"gemini",
	"opencode",
	"pi",
	"copilot",
	"cursor-agent",
] as const;

export type AgentType = (typeof AGENT_TYPES)[number];

export const AGENT_LABELS: Record<AgentType, string> = {
	claude: "Claude",
	codex: "Codex",
	gemini: "Gemini",
	opencode: "OpenCode",
	pi: "Pi",
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
	pi: ["pi"],
	copilot: ["copilot --allow-all"],
	"cursor-agent": ["cursor-agent"],
};

export const AGENT_PRESET_DESCRIPTIONS: Record<AgentType, string> = {
	claude:
		"Anthropic's coding agent for reading code, editing files, and running terminal workflows.",
	codex:
		"OpenAI's coding agent for reading, modifying, and running code across tasks.",
	gemini:
		"Google's open-source terminal agent for coding, problem-solving, and task work.",
	opencode: "Open-source coding agent for the terminal, IDE, and desktop.",
	pi: "Minimal terminal coding harness for flexible coding workflows.",
	copilot:
		"GitHub's coding agent for planning, editing, and building in your repo.",
	"cursor-agent":
		"Cursor's coding agent for editing, running, and debugging code in parallel.",
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
	pi: {
		command: AGENT_PRESET_COMMANDS.pi[0] ?? "pi",
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

export type ShellPlatform = "win32" | "unix";

function readFileExpression(
	filePath: string,
	platform: ShellPlatform,
): string {
	if (platform === "win32") {
		const escaped = filePath.replaceAll("'", "''");
		return `(Get-Content '${escaped}' -Raw)`;
	}
	const escaped = filePath.replaceAll("'", "'\\''");
	return `"$(cat '${escaped}')"`;
}

const AGENT_BASE_COMMANDS: Record<
	AgentType,
	{ prefix: string; suffix?: string }
> = {
	claude: { prefix: "claude --dangerously-skip-permissions" },
	codex: {
		prefix:
			'codex -c model_reasoning_effort="high" --dangerously-bypass-approvals-and-sandbox -c model_reasoning_summary="detailed" -c model_supports_reasoning_summaries=true --',
	},
	gemini: { prefix: "gemini --yolo" },
	opencode: { prefix: "opencode --prompt" },
	copilot: { prefix: "copilot -i", suffix: "--yolo" },
	"cursor-agent": { prefix: "cursor-agent --yolo" },
};

export function buildAgentFileCommand({
	filePath,
	agent = "claude",
	platform = "unix",
}: {
	filePath: string;
	agent?: AgentType;
	platform?: ShellPlatform;
}): string {
	const { prefix, suffix } = AGENT_BASE_COMMANDS[agent];
	const fileExpr = readFileExpression(filePath, platform);
	return suffix
		? `${prefix} ${fileExpr} ${suffix}`
		: `${prefix} ${fileExpr}`;
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

function buildAgentHeredoc(
	agent: AgentType,
	prompt: string,
	delimiter: string,
): string {
	const { prefix, suffix } = AGENT_BASE_COMMANDS[agent];
	return buildHeredoc(prompt, delimiter, prefix, suffix);
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
	return buildAgentHeredoc(agent, prompt, delimiter);
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
