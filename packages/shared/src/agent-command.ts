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
	const metadata = [
		`Priority: ${task.priority}`,
		task.statusName && `Status: ${task.statusName}`,
		task.labels?.length && `Labels: ${task.labels.join(", ")}`,
	]
		.filter(Boolean)
		.join("\n");

	return `You are working on task "${task.title}" (${task.slug}).

${metadata}

## Task Description

${task.description || "No description provided."}

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
5. When done, use the Superset MCP \`update_task\` tool to update task "${task.id}" with a summary of what was done`;
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

const AGENT_FILE_COMMANDS: Record<
	AgentType,
	Record<"danger" | "safe", (filePath: string) => string>
> = {
	claude: {
		danger: (filePath) =>
			`claude --dangerously-skip-permissions "$(cat '${filePath}')"`,
		safe: (filePath) => `claude "$(cat '${filePath}')"`,
	},
	codex: {
		danger: (filePath) =>
			`codex -c model_reasoning_effort="high" --dangerously-bypass-approvals-and-sandbox -c model_reasoning_summary="detailed" -c model_supports_reasoning_summaries=true -- "$(cat '${filePath}')"`,
		safe: (filePath) =>
			`codex -c model_reasoning_effort="high" -c model_reasoning_summary="detailed" -c model_supports_reasoning_summaries=true -- "$(cat '${filePath}')"`,
	},
	gemini: {
		danger: (filePath) => `gemini --yolo "$(cat '${filePath}')"`,
		safe: (filePath) => `gemini "$(cat '${filePath}')"`,
	},
	opencode: {
		danger: (filePath) => `opencode --prompt "$(cat '${filePath}')"`,
		safe: (filePath) => `opencode --prompt "$(cat '${filePath}')"`,
	},
	copilot: {
		danger: (filePath) => `copilot -i "$(cat '${filePath}')" --yolo`,
		safe: (filePath) => `copilot -i "$(cat '${filePath}')"`,
	},
	"cursor-agent": {
		danger: (filePath) => `cursor-agent --yolo "$(cat '${filePath}')"`,
		safe: (filePath) => `cursor-agent "$(cat '${filePath}')"`,
	},
};

export function buildAgentFileCommand({
	filePath,
	agent = "claude",
	skipPermissions = true,
}: {
	filePath: string;
	agent?: AgentType;
	skipPermissions?: boolean;
}): string {
	const mode = skipPermissions ? "danger" : "safe";
	const builder = AGENT_FILE_COMMANDS[agent][mode];
	const escaped = filePath.replaceAll("'", "'\\''");
	return builder(escaped);
}

const AGENT_COMMANDS: Record<
	AgentType,
	Record<"danger" | "safe", (prompt: string, delimiter: string) => string>
> = {
	claude: {
		danger: (prompt, delimiter) =>
			buildHeredoc(prompt, delimiter, "claude --dangerously-skip-permissions"),
		safe: (prompt, delimiter) => buildHeredoc(prompt, delimiter, "claude"),
	},
	codex: {
		danger: (prompt, delimiter) =>
			buildHeredoc(
				prompt,
				delimiter,
				'codex -c model_reasoning_effort="high" --dangerously-bypass-approvals-and-sandbox --',
			),
		safe: (prompt, delimiter) =>
			buildHeredoc(
				prompt,
				delimiter,
				'codex -c model_reasoning_effort="high" --',
			),
	},
	gemini: {
		danger: (prompt, delimiter) =>
			buildHeredoc(prompt, delimiter, "gemini --yolo"),
		safe: (prompt, delimiter) => buildHeredoc(prompt, delimiter, "gemini"),
	},
	opencode: {
		danger: (prompt, delimiter) =>
			buildHeredoc(prompt, delimiter, "opencode --prompt"),
		safe: (prompt, delimiter) =>
			buildHeredoc(prompt, delimiter, "opencode --prompt"),
	},
	copilot: {
		danger: (prompt, delimiter) =>
			buildHeredoc(prompt, delimiter, "copilot -i", "--yolo"),
		safe: (prompt, delimiter) => buildHeredoc(prompt, delimiter, "copilot -i"),
	},
	"cursor-agent": {
		danger: (prompt, delimiter) =>
			buildHeredoc(prompt, delimiter, "cursor-agent --yolo"),
		safe: (prompt, delimiter) =>
			buildHeredoc(prompt, delimiter, "cursor-agent"),
	},
};

export function buildAgentPromptCommand({
	prompt,
	randomId,
	agent = "claude",
	skipPermissions = true,
}: {
	prompt: string;
	randomId: string;
	agent?: AgentType;
	skipPermissions?: boolean;
}): string {
	let delimiter = `SUPERSET_PROMPT_${randomId.replaceAll("-", "")}`;
	while (prompt.includes(delimiter)) {
		delimiter = `${delimiter}_X`;
	}
	const mode = skipPermissions ? "danger" : "safe";
	const builder = AGENT_COMMANDS[agent][mode];
	return builder(prompt, delimiter);
}

export function buildAgentCommand({
	task,
	randomId,
	agent = "claude",
	skipPermissions = true,
}: {
	task: TaskInput;
	randomId: string;
	agent?: AgentType;
	skipPermissions?: boolean;
}): string {
	const prompt = buildAgentTaskPrompt(task);
	return buildAgentPromptCommand({ prompt, randomId, agent, skipPermissions });
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
