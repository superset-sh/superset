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

function isFishShell(shell: string): boolean {
	return (shell.split("/").pop() ?? shell) === "fish";
}

/**
 * Encode a string to base64, handling Unicode correctly.
 * Works in both Node.js/Bun (via Buffer) and browser environments.
 */
function encodeBase64(str: string): string {
	if (typeof Buffer !== "undefined") {
		return Buffer.from(str, "utf-8").toString("base64");
	}
	// Browser fallback with proper UTF-8 encoding
	const bytes = new TextEncoder().encode(str);
	let binary = "";
	for (const byte of bytes) {
		binary += String.fromCharCode(byte);
	}
	return btoa(binary);
}

/**
 * Escape a string for use inside Fish double-quoted strings.
 * In Fish, `\`, `"`, `$`, `(`, and `)` are special inside double quotes.
 */
function escapeFishDoubleQuoted(value: string): string {
	return value
		.replaceAll("\\", "\\\\")
		.replaceAll('"', '\\"')
		.replaceAll("$", "\\$")
		.replaceAll("(", "\\(")
		.replaceAll(")", "\\)");
}

/**
 * Fish-compatible agent commands using base64-encoded prompt.
 * Fish does not support bash heredocs (<<'EOF') or $() substitution.
 * Instead we base64-encode the prompt and decode it via Fish's (cmd) substitution.
 */
const FISH_AGENT_PROMPT_COMMANDS: Record<
	AgentType,
	(encoded: string) => string
> = {
	claude: (encoded) =>
		`claude --dangerously-skip-permissions (printf '%s' '${encoded}' | base64 -d)`,
	codex: (encoded) =>
		`codex -c model_reasoning_effort="high" --dangerously-bypass-approvals-and-sandbox -c model_reasoning_summary="detailed" -c model_supports_reasoning_summaries=true -- (printf '%s' '${encoded}' | base64 -d)`,
	gemini: (encoded) => `gemini --yolo (printf '%s' '${encoded}' | base64 -d)`,
	opencode: (encoded) =>
		`opencode --prompt (printf '%s' '${encoded}' | base64 -d)`,
	copilot: (encoded) =>
		`copilot -i (printf '%s' '${encoded}' | base64 -d) --yolo`,
	"cursor-agent": (encoded) =>
		`cursor-agent --yolo (printf '%s' '${encoded}' | base64 -d)`,
};

/**
 * Fish-compatible agent file commands.
 * Fish uses (cat path) instead of bash's "$(cat path)".
 */
const FISH_AGENT_FILE_COMMANDS: Record<
	AgentType,
	(filePath: string) => string
> = {
	claude: (filePath) =>
		`claude --dangerously-skip-permissions (cat "${filePath}")`,
	codex: (filePath) =>
		`codex -c model_reasoning_effort="high" --dangerously-bypass-approvals-and-sandbox -c model_reasoning_summary="detailed" -c model_supports_reasoning_summaries=true -- (cat "${filePath}")`,
	gemini: (filePath) => `gemini --yolo (cat "${filePath}")`,
	opencode: (filePath) => `opencode --prompt (cat "${filePath}")`,
	copilot: (filePath) => `copilot -i (cat "${filePath}") --yolo`,
	"cursor-agent": (filePath) => `cursor-agent --yolo (cat "${filePath}")`,
};

const AGENT_FILE_COMMANDS: Record<AgentType, (filePath: string) => string> = {
	claude: (filePath) =>
		`claude --dangerously-skip-permissions "$(cat '${filePath}')"`,
	codex: (filePath) =>
		`codex -c model_reasoning_effort="high" --dangerously-bypass-approvals-and-sandbox -c model_reasoning_summary="detailed" -c model_supports_reasoning_summaries=true -- "$(cat '${filePath}')"`,
	gemini: (filePath) => `gemini --yolo "$(cat '${filePath}')"`,
	opencode: (filePath) => `opencode --prompt "$(cat '${filePath}')"`,
	copilot: (filePath) => `copilot -i "$(cat '${filePath}')" --yolo`,
	"cursor-agent": (filePath) => `cursor-agent --yolo "$(cat '${filePath}')"`,
};

export function buildAgentFileCommand({
	filePath,
	agent = "claude",
	shell,
}: {
	filePath: string;
	agent?: AgentType;
	shell?: string;
}): string {
	if (shell && isFishShell(shell)) {
		const escaped = escapeFishDoubleQuoted(filePath);
		return FISH_AGENT_FILE_COMMANDS[agent](escaped);
	}
	const builder = AGENT_FILE_COMMANDS[agent];
	const escaped = filePath.replaceAll("'", "'\\''");
	return builder(escaped);
}

const AGENT_COMMANDS: Record<
	AgentType,
	(prompt: string, delimiter: string) => string
> = {
	claude: (prompt, delimiter) =>
		buildHeredoc(prompt, delimiter, "claude --dangerously-skip-permissions"),
	codex: (prompt, delimiter) =>
		buildHeredoc(
			prompt,
			delimiter,
			'codex -c model_reasoning_effort="high" --dangerously-bypass-approvals-and-sandbox --',
		),
	gemini: (prompt, delimiter) =>
		buildHeredoc(prompt, delimiter, "gemini --yolo"),
	opencode: (prompt, delimiter) =>
		buildHeredoc(prompt, delimiter, "opencode --prompt"),
	copilot: (prompt, delimiter) =>
		buildHeredoc(prompt, delimiter, "copilot -i", "--yolo"),
	"cursor-agent": (prompt, delimiter) =>
		buildHeredoc(prompt, delimiter, "cursor-agent --yolo"),
};

export function buildAgentPromptCommand({
	prompt,
	randomId,
	agent = "claude",
	shell,
}: {
	prompt: string;
	randomId: string;
	agent?: AgentType;
	/** Optional shell path (e.g. "/opt/homebrew/bin/fish"). When fish is detected,
	 *  generates a fish-compatible command instead of a bash heredoc. */
	shell?: string;
}): string {
	if (shell && isFishShell(shell)) {
		const encoded = encodeBase64(prompt);
		return FISH_AGENT_PROMPT_COMMANDS[agent](encoded);
	}
	let delimiter = `SUPERSET_PROMPT_${randomId.replaceAll("-", "")}`;
	while (prompt.includes(delimiter)) {
		delimiter = `${delimiter}_X`;
	}
	const builder = AGENT_COMMANDS[agent];
	return builder(prompt, delimiter);
}

export function buildAgentCommand({
	task,
	randomId,
	agent = "claude",
	shell,
}: {
	task: TaskInput;
	randomId: string;
	agent?: AgentType;
	shell?: string;
}): string {
	const prompt = buildAgentTaskPrompt(task);
	return buildAgentPromptCommand({ prompt, randomId, agent, shell });
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
