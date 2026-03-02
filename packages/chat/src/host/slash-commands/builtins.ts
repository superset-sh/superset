import type { SlashCommandRegistryEntry } from "./types";

const BUILTIN_COMMANDS: SlashCommandRegistryEntry[] = [
	{
		name: "new",
		aliases: ["clear"],
		description: "Start a fresh chat session in this pane.",
		argumentHint: "",
		kind: "builtin",
		source: "builtin",
		action: { type: "new_session" },
		template: "Start a fresh chat session in this pane.",
	},
	{
		name: "stop",
		aliases: [],
		description: "Stop the currently running response.",
		argumentHint: "",
		kind: "builtin",
		source: "builtin",
		action: { type: "stop_stream" },
		template: "Stop the currently running response.",
	},
	{
		name: "model",
		aliases: [],
		description:
			"Switch the active model for this chat, or open the model picker.",
		argumentHint: "[<model-id-or-name>]",
		kind: "builtin",
		source: "builtin",
		action: { type: "set_model", passArguments: true },
		template: "Switch active model in this chat. Requested model: $ARGUMENTS",
	},
	{
		name: "mcp",
		aliases: [],
		description: "Show configured MCP servers and their current state.",
		argumentHint: "",
		kind: "builtin",
		source: "builtin",
		action: { type: "show_mcp_overview" },
		template: "Show MCP server overview for this workspace.",
	},
	{
		name: "review",
		aliases: [],
		description: "Review code for bugs, regressions, and missing tests.",
		argumentHint: "[<scope>]",
		kind: "builtin",
		source: "builtin",
		template: [
			"Please review this work for correctness and risk.",
			"If scope/context is provided, prioritize it: $ARGUMENTS",
			"Return findings ordered by severity with file references.",
		].join("\n"),
	},
	{
		name: "plan",
		aliases: [],
		description: "Draft an implementation plan before coding.",
		argumentHint: "[<goal>]",
		kind: "builtin",
		source: "builtin",
		template: [
			"Create a concise implementation plan.",
			"If a goal is provided, target this: $ARGUMENTS",
			"Include phases, risks, and verification steps.",
		].join("\n"),
	},
	{
		name: "test",
		aliases: [],
		description: "Design tests and edge cases for a target.",
		argumentHint: "[<target>]",
		kind: "builtin",
		source: "builtin",
		template: [
			"Design and run tests for the requested change.",
			"Primary target/context (optional): $ARGUMENTS",
			"Focus on behavioral regressions and edge cases.",
		].join("\n"),
	},
	{
		name: "refactor",
		aliases: [],
		description: "Propose a refactor with constraints and safeguards.",
		argumentHint: "[<scope>]",
		kind: "builtin",
		source: "builtin",
		template: [
			"Refactor request",
			"Scope/context: $ARGUMENTS",
			"Propose staged changes with safeguards and verification.",
		].join("\n"),
	},
];

export function getBuiltInSlashCommands(): SlashCommandRegistryEntry[] {
	return BUILTIN_COMMANDS.map((command) => ({
		...command,
		aliases: [...command.aliases],
		action: command.action ? { ...command.action } : undefined,
	}));
}
