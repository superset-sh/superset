import { describe, expect, it } from "bun:test";
import {
	resolveCommandAction,
	type SlashCommand,
	shouldSuppressSlashMenuForCommittedCommand,
	sortSlashCommandMatches,
} from "./useSlashCommands";

function createCommand(
	command: Partial<SlashCommand> & { name: string },
): SlashCommand {
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

describe("resolveCommandAction", () => {
	it("keeps composer open for commands with optional hints", () => {
		const action = resolveCommandAction(
			createCommand({ name: "plan", argumentHint: "[<goal>]" }),
		);
		expect(action).toEqual({ text: "/plan ", shouldSend: false });
	});

	it("keeps composer open for required argument hints", () => {
		const action = resolveCommandAction(
			createCommand({ name: "grep", argumentHint: "<pattern>" }),
		);
		expect(action).toEqual({ text: "/grep ", shouldSend: false });
	});

	it("sends immediately when no argument hint exists", () => {
		const action = resolveCommandAction(createCommand({ name: "new" }));
		expect(action).toEqual({ text: "", shouldSend: true });
	});
});

describe("sortSlashCommandMatches", () => {
	it("places builtin commands after custom commands when ranks tie", () => {
		const sorted = sortSlashCommandMatches([
			{
				command: createCommand({
					name: "plan",
					kind: "builtin",
					source: "builtin",
				}),
				rank: 0,
			},
			{
				command: createCommand({
					name: "deploy",
					kind: "custom",
					source: "project",
				}),
				rank: 0,
			},
		]);

		expect(sorted.map((command) => command.name)).toEqual(["deploy", "plan"]);
	});

	it("keeps builtins at the end even when builtin rank is better", () => {
		const sorted = sortSlashCommandMatches([
			{
				command: createCommand({
					name: "plan",
					kind: "builtin",
					source: "builtin",
				}),
				rank: 0,
			},
			{
				command: createCommand({
					name: "deploy",
					kind: "custom",
					source: "project",
				}),
				rank: 1,
			},
		]);

		expect(sorted.map((command) => command.name)).toEqual(["deploy", "plan"]);
	});
});

describe("shouldSuppressSlashMenuForCommittedCommand", () => {
	it("suppresses menu for exact command match with argument hint", () => {
		expect(
			shouldSuppressSlashMenuForCommittedCommand("model", [
				createCommand({
					name: "model",
					aliases: [],
					argumentHint: "[<model-id-or-name>]",
				}),
			]),
		).toBe(true);
	});

	it("does not suppress menu for exact command match without argument hint", () => {
		expect(
			shouldSuppressSlashMenuForCommittedCommand("new", [
				createCommand({ name: "new", aliases: [], argumentHint: "" }),
			]),
		).toBe(false);
	});

	it("does not suppress menu for partial matches", () => {
		expect(
			shouldSuppressSlashMenuForCommittedCommand("mod", [
				createCommand({
					name: "model",
					aliases: ["m"],
					argumentHint: "[<model-id-or-name>]",
				}),
			]),
		).toBe(false);
	});
});
