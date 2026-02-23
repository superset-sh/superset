import type { SlashCommandRegistryEntry } from "./types";

const BUILTIN_COMMANDS: SlashCommandRegistryEntry[] = [
	{
		name: "review",
		description: "Review code for bugs, regressions, and missing tests.",
		argumentHint: "<scope>",
		kind: "builtin",
		source: "builtin",
		template: [
			"Please review this work for correctness and risk.",
			"Scope: $ARGUMENTS",
			"Return findings ordered by severity with file references.",
		].join("\n"),
	},
	{
		name: "plan",
		description: "Draft an implementation plan before coding.",
		argumentHint: "<goal>",
		kind: "builtin",
		source: "builtin",
		template: [
			"Create a concise implementation plan.",
			"Goal: $ARGUMENTS",
			"Include phases, risks, and verification steps.",
		].join("\n"),
	},
	{
		name: "test",
		description: "Design tests and edge cases for a target.",
		argumentHint: "<target>",
		kind: "builtin",
		source: "builtin",
		template: [
			"Design and run tests for the requested target.",
			"Target: $1",
			"Raw input: $ARGUMENTS",
			"Focus on behavioral regressions and edge cases.",
		].join("\n"),
	},
	{
		name: "refactor",
		description: "Propose a refactor with constraints and safeguards.",
		argumentHint: "<scope> [goal=...]",
		kind: "builtin",
		source: "builtin",
		template: [
			"Refactor request",
			"Scope: $1",
			`Goal: ${"${"}GOAL}`,
			`Constraints: ${"${"}CONSTRAINTS}`,
			"Raw arguments: $ARGUMENTS",
		].join("\n"),
	},
];

export function getBuiltInSlashCommands(): SlashCommandRegistryEntry[] {
	return BUILTIN_COMMANDS.map((command) => ({ ...command }));
}
