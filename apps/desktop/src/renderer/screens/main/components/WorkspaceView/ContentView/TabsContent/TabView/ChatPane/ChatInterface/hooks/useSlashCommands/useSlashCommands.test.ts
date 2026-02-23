import { describe, expect, it } from "bun:test";
import {
	hasRequiredSlashCommandArguments,
	resolveCommandAction,
	sortSlashCommandMatches,
	type SlashCommand,
} from "./useSlashCommands";

function createCommand(command: Partial<SlashCommand> & { name: string }): SlashCommand {
	return {
		name: command.name,
		aliases: command.aliases ?? [],
		description: command.description ?? "",
		argumentHint: command.argumentHint ?? "",
		kind: command.kind ?? "custom",
		source: command.source ?? "project",
		action: command.action,
	};
}

describe("hasRequiredSlashCommandArguments", () => {
	it("returns false for empty and optional-only hints", () => {
		expect(hasRequiredSlashCommandArguments("")).toBe(false);
		expect(hasRequiredSlashCommandArguments("[<goal>]")).toBe(false);
		expect(hasRequiredSlashCommandArguments("[--scope=<path>] [<target>]")).toBe(
			false,
		);
	});

	it("returns true when required segments are present", () => {
		expect(hasRequiredSlashCommandArguments("<target>")).toBe(true);
		expect(hasRequiredSlashCommandArguments("$PATH")).toBe(true);
		expect(hasRequiredSlashCommandArguments("<target> [goal=...]")).toBe(true);
	});
});

describe("resolveCommandAction", () => {
	it("sends immediately for commands with optional-only hints", () => {
		const action = resolveCommandAction(
			createCommand({ name: "plan", argumentHint: "[<goal>]" }),
		);
		expect(action).toEqual({ text: "", shouldSend: true });
	});

	it("keeps composer open for required argument hints", () => {
		const action = resolveCommandAction(
			createCommand({ name: "grep", argumentHint: "<pattern>" }),
		);
		expect(action).toEqual({ text: "/grep ", shouldSend: false });
	});
});

describe("sortSlashCommandMatches", () => {
	it("places builtin commands after custom commands when ranks tie", () => {
		const sorted = sortSlashCommandMatches([
			{ command: createCommand({ name: "plan", kind: "builtin", source: "builtin" }), rank: 0 },
			{ command: createCommand({ name: "deploy", kind: "custom", source: "project" }), rank: 0 },
		]);

		expect(sorted.map((command) => command.name)).toEqual(["deploy", "plan"]);
	});

	it("keeps builtins at the end even when builtin rank is better", () => {
		const sorted = sortSlashCommandMatches([
			{ command: createCommand({ name: "plan", kind: "builtin", source: "builtin" }), rank: 0 },
			{ command: createCommand({ name: "deploy", kind: "custom", source: "project" }), rank: 1 },
		]);

		expect(sorted.map((command) => command.name)).toEqual(["deploy", "plan"]);
	});
});
