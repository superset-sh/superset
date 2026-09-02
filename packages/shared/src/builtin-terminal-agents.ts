import {
	createTerminalAgentDefinition,
	type TerminalAgentDefinition,
	type TerminalAgentDefinitionInput,
} from "./agent-definition";
import type { PromptTransport } from "./agent-prompt-launch";
import { DEFAULT_TERMINAL_TASK_PROMPT_TEMPLATE } from "./agent-prompt-template";

interface BuiltinTerminalAgentManifest
	extends Omit<
		TerminalAgentDefinitionInput,
		"source" | "kind" | "enabled" | "taskPromptTemplate"
	> {
	description: string;
	includeInDefaultTerminalPresets?: boolean;
}

export interface BuiltinTerminalAgentDefinition
	extends TerminalAgentDefinition {
	description: string;
	includeInDefaultTerminalPresets?: boolean;
}

type AgentIdTuple<T extends readonly { id: string }[]> = {
	[K in keyof T]: T[K] extends { id: infer TId } ? TId : never;
};

function mapAgentIds<const T extends readonly { id: string }[]>(
	agents: T,
): AgentIdTuple<T> {
	return agents.map((agent) => agent.id) as AgentIdTuple<T>;
}

function createAgentRecord<const T extends readonly { id: string }[], TValue>(
	agents: T,
	getValue: (agent: T[number]) => TValue,
): Record<T[number]["id"], TValue> {
	return Object.fromEntries(
		agents.map((agent) => [agent.id, getValue(agent)]),
	) as Record<T[number]["id"], TValue>;
}

function createBuiltinTerminalAgent<
	const T extends BuiltinTerminalAgentManifest,
>(manifest: T): BuiltinTerminalAgentDefinition & { id: T["id"] } {
	return {
		...createTerminalAgentDefinition({
			...manifest,
			source: "builtin",
			kind: "terminal",
			enabled: true,
			taskPromptTemplate: DEFAULT_TERMINAL_TASK_PROMPT_TEMPLATE,
		}),
		description: manifest.description,
		includeInDefaultTerminalPresets: manifest.includeInDefaultTerminalPresets,
	};
}

export const BUILTIN_TERMINAL_AGENTS = [
	createBuiltinTerminalAgent({
		id: "claude",
		label: "Claude",
		description:
			"Anthropic's coding agent for reading code, editing files, and running terminal workflows.",
		command: "claude --dangerously-skip-permissions",
		resumeCommand: "claude --dangerously-skip-permissions --resume",
		forkCommand:
			"claude --dangerously-skip-permissions --resume {sessionId} --fork-session",
		nonInteractiveCommand: "claude -p",
		includeInDefaultTerminalPresets: true,
	}),
	createBuiltinTerminalAgent({
		id: "amp",
		label: "Amp",
		description:
			"Amp's coding agent for terminal-first coding, subagents, and task work.",
		command: "amp",
		resumeCommand: "amp threads continue",
		nonInteractiveCommand: "amp -x",
		promptTransport: "stdin",
		includeInDefaultTerminalPresets: true,
	}),
	createBuiltinTerminalAgent({
		id: "codex",
		label: "Codex",
		description:
			"OpenAI's coding agent for reading, modifying, and running code across tasks.",
		command:
			"codex --dangerously-bypass-approvals-and-sandbox --dangerously-bypass-hook-trust",
		promptCommand:
			"codex --dangerously-bypass-approvals-and-sandbox --dangerously-bypass-hook-trust --",
		resumeCommand:
			"codex --dangerously-bypass-approvals-and-sandbox --dangerously-bypass-hook-trust resume",
		forkCommand:
			"codex --dangerously-bypass-approvals-and-sandbox --dangerously-bypass-hook-trust fork {sessionId}",
		nonInteractiveCommand: "codex exec --skip-git-repo-check",
		includeInDefaultTerminalPresets: true,
	}),
	createBuiltinTerminalAgent({
		id: "gemini",
		label: "Gemini",
		description:
			"Google's open-source terminal agent for coding, problem-solving, and task work.",
		command: "gemini --approval-mode=auto_edit",
		promptCommand: "gemini --approval-mode=auto_edit",
		resumeCommand: "gemini --approval-mode=auto_edit --resume",
		nonInteractiveCommand: "gemini --skip-trust -p",
		includeInDefaultTerminalPresets: true,
	}),
	createBuiltinTerminalAgent({
		id: "mastracode",
		label: "Mastracode",
		description:
			"Mastra's coding agent for building, debugging, and shipping code from the terminal.",
		command: "mastracode",
		promptCommand: "mastracode --prompt",
		promptCommandSuffix: "; mastracode",
		resumeCommand: "mastracode --thread",
		nonInteractiveCommand: "mastracode --mode plan --prompt",
	}),
	createBuiltinTerminalAgent({
		id: "opencode",
		label: "OpenCode",
		description: "Open-source coding agent for the terminal, IDE, and desktop.",
		command: "opencode",
		promptCommand: "opencode --prompt",
		resumeCommand: "opencode --session",
		forkCommand: "opencode --session {sessionId} --fork",
		nonInteractiveCommand: "opencode run --agent plan",
	}),
	createBuiltinTerminalAgent({
		id: "omp",
		label: "Oh My Pi",
		description:
			"Oh My Pi's coding agent for terminal-first coding, session-aware workflows, and task work.",
		command: "omp",
		includeInDefaultTerminalPresets: true,
	}),
	createBuiltinTerminalAgent({
		id: "pi",
		label: "Pi",
		description:
			"Minimal terminal coding harness for flexible coding workflows.",
		command: "pi",
		resumeCommand: "pi --session",
		forkCommand: "pi --fork {sessionId}",
		nonInteractiveCommand: "pi --no-tools -p",
	}),
	createBuiltinTerminalAgent({
		id: "copilot",
		label: "Copilot",
		description:
			"GitHub's coding agent for planning, editing, and building in your repo.",
		command: "copilot --allow-tool=write",
		promptCommand: "copilot --allow-tool=write -i",
		resumeCommand: "copilot --allow-tool=write --resume",
		nonInteractiveCommand: "copilot -p",
		includeInDefaultTerminalPresets: true,
	}),
	createBuiltinTerminalAgent({
		id: "vibe",
		label: "Mistral Vibe",
		description:
			"Mistral's coding agent for reading, editing, and running code from the terminal.",
		command: "vibe --trust --auto-approve",
		resumeCommand: "vibe --trust --auto-approve --resume",
		nonInteractiveCommand: "vibe --trust --agent plan -p",
		includeInDefaultTerminalPresets: true,
	}),
	createBuiltinTerminalAgent({
		id: "kimi",
		label: "Kimi Code",
		description:
			"Moonshot AI's coding agent for reading, editing, and running code from the terminal.",
		command: "kimi",
		promptCommand: "kimi -p",
		promptCommandSuffix: "; kimi --auto --continue",
		resumeCommand: "kimi --session",
		includeInDefaultTerminalPresets: true,
	}),
	createBuiltinTerminalAgent({
		id: "grok",
		label: "Grok",
		description:
			"xAI's coding agent for reading, editing, and running code from the terminal.",
		command: "grok --always-approve",
		resumeCommand: "grok --always-approve --resume",
		forkCommand: "grok --always-approve --resume {sessionId} --fork-session",
		nonInteractiveCommand: "grok --permission-mode plan -p",
		includeInDefaultTerminalPresets: true,
	}),
	createBuiltinTerminalAgent({
		id: "cursor-agent",
		label: "Cursor Agent",
		description:
			"Cursor's coding agent for editing, running, and debugging code in parallel.",
		command: "cursor-agent",
		resumeCommand: "cursor-agent --resume",
		nonInteractiveCommand: "cursor-agent --trust --mode ask -p",
	}),
	createBuiltinTerminalAgent({
		id: "droid",
		label: "Droid",
		description: "Factory's autonomous coding agent for terminal workflows.",
		command: "droid",
		resumeCommand: "droid --resume",
		forkCommand: "droid --fork {sessionId}",
		nonInteractiveCommand: "droid exec",
	}),
	createBuiltinTerminalAgent({
		id: "polygraph",
		label: "Polygraph",
		description:
			"The meta-harness that gives agents cross-repo visibility and memory that survives every session.",
		command: "polygraph session start",
		promptCommand: "polygraph session start --",
	}),
	createBuiltinTerminalAgent({
		id: "kiro",
		label: "Kiro",
		description:
			"AWS's spec-driven coding agent for agentic workflows in the terminal.",
		command: "kiro-cli chat --trust-all-tools",
		resumeCommand: "kiro-cli chat --trust-all-tools --resume-id",
		nonInteractiveCommand: "kiro-cli chat --no-interactive",
	}),
	createBuiltinTerminalAgent({
		// Google's Antigravity CLI. The id matches the binary name (`agy`), the
		// same way every other builtin id is the command users type.
		id: "agy",
		label: "Antigravity",
		description:
			"Google's Antigravity CLI for reasoning, editing, and running code from the terminal.",
		command: "agy --mode accept-edits",
		promptCommand: "agy --mode accept-edits -i",
		resumeCommand: "agy --mode accept-edits --conversation",
		nonInteractiveCommand: "agy -p",
	}),
	createBuiltinTerminalAgent({
		id: "fx",
		label: "fx",
		description:
			"Vercel's coding agent for reading, editing, and running code from the terminal.",
		command: "fx",
		promptCommand: "fx ask --auto",
		promptCommandSuffix: "; fx resume last",
		resumeCommand: "fx resume",
		nonInteractiveCommand: "fx ask --auto",
	}),
	createBuiltinTerminalAgent({
		id: "hermes",
		label: "Hermes",
		description:
			"Nous Research's autonomous agent for coding, research, and terminal workflows.",
		command: "hermes chat --yolo",
		promptCommand: "hermes chat --yolo -q",
		promptCommandSuffix: "; hermes chat --yolo -c",
		resumeCommand: "hermes chat --yolo -r",
		nonInteractiveCommand: "hermes chat -q",
	}),
] as const;

export type BuiltinTerminalAgentType =
	(typeof BUILTIN_TERMINAL_AGENTS)[number]["id"];

export const BUILTIN_TERMINAL_AGENT_TYPES = mapAgentIds(
	BUILTIN_TERMINAL_AGENTS,
);

export const BUILTIN_TERMINAL_AGENT_LABELS = createAgentRecord(
	BUILTIN_TERMINAL_AGENTS,
	(agent) => agent.label,
);

export const BUILTIN_TERMINAL_AGENT_DESCRIPTIONS = createAgentRecord(
	BUILTIN_TERMINAL_AGENTS,
	(agent) => agent.description,
);

export const BUILTIN_TERMINAL_AGENT_COMMANDS = createAgentRecord(
	BUILTIN_TERMINAL_AGENTS,
	(agent) => [agent.command],
);

/**
 * Headless one-shot command per builtin agent, or undefined for agents
 * without a non-interactive mode (polygraph orchestrates sessions and has
 * no one-shot prompt form).
 */
export const BUILTIN_TERMINAL_AGENT_NON_INTERACTIVE_COMMANDS =
	createAgentRecord(
		BUILTIN_TERMINAL_AGENTS,
		(agent) => agent.nonInteractiveCommand,
	);

export const BUILTIN_TERMINAL_AGENT_PROMPT_COMMANDS = createAgentRecord(
	BUILTIN_TERMINAL_AGENTS,
	(
		agent,
	): {
		command: string;
		suffix?: string;
		transport: PromptTransport;
	} => ({
		command: agent.promptCommand,
		suffix: agent.promptCommandSuffix,
		transport: agent.promptTransport,
	}),
);

export const DEFAULT_TERMINAL_PRESET_AGENT_TYPES =
	BUILTIN_TERMINAL_AGENTS.filter(
		(agent) => agent.includeInDefaultTerminalPresets,
	).map((agent) => agent.id) satisfies BuiltinTerminalAgentType[];
