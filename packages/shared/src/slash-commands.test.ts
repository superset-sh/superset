import { describe, expect, it } from "bun:test";
import {
	findSlashCommandByNameOrAlias,
	getCommandMatchRank,
	type SlashCommand,
	shouldSuppressSlashMenuForCommittedCommand,
	sortSlashCommandMatches,
} from "./slash-commands";

function command(
	overrides: Partial<SlashCommand> & { name: string },
): SlashCommand {
	return {
		aliases: [],
		description: "",
		argumentHint: "",
		kind: "custom",
		source: "project",
		entryKind: "command",
		trigger: "/",
		...overrides,
	};
}

describe("getCommandMatchRank", () => {
	it("ranks exact, prefix, then substring matches", () => {
		const deslop = command({ name: "deslop" });
		expect(getCommandMatchRank(deslop, "deslop")).toBe(0);
		expect(getCommandMatchRank(deslop, "des")).toBe(1);
		expect(getCommandMatchRank(deslop, "slop")).toBe(2);
		expect(getCommandMatchRank(deslop, "xyz")).toBeNull();
	});

	it("matches everything on an empty query", () => {
		expect(getCommandMatchRank(command({ name: "anything" }), "")).toBe(0);
	});

	it("offsets alias matches below name matches", () => {
		const fresh = command({ name: "new", aliases: ["clear"] });
		expect(getCommandMatchRank(fresh, "clear")).toBe(3);
		expect(getCommandMatchRank(fresh, "cle")).toBe(4);
	});
});

describe("sortSlashCommandMatches", () => {
	it("sorts builtins last, then by rank, then by name", () => {
		const sorted = sortSlashCommandMatches([
			{ command: command({ name: "model", kind: "builtin" }), rank: 0 },
			{ command: command({ name: "zeta" }), rank: 1 },
			{ command: command({ name: "alpha" }), rank: 1 },
			{ command: command({ name: "beta" }), rank: 0 },
		]);
		expect(sorted.map((entry) => entry.name)).toEqual([
			"beta",
			"alpha",
			"zeta",
			"model",
		]);
	});
});

describe("shouldSuppressSlashMenuForCommittedCommand", () => {
	it("suppresses only when the committed command takes arguments", () => {
		const commands = [
			command({ name: "refactor", argumentHint: "<scope>" }),
			command({ name: "deslop" }),
		];
		expect(
			shouldSuppressSlashMenuForCommittedCommand("refactor", commands),
		).toBe(true);
		expect(shouldSuppressSlashMenuForCommittedCommand("deslop", commands)).toBe(
			false,
		);
		expect(shouldSuppressSlashMenuForCommittedCommand("nope", commands)).toBe(
			false,
		);
		expect(shouldSuppressSlashMenuForCommittedCommand(null, commands)).toBe(
			false,
		);
	});
});

describe("findSlashCommandByNameOrAlias", () => {
	it("finds by name or alias, case-insensitively", () => {
		const commands = [command({ name: "new", aliases: ["Clear"] })];
		expect(findSlashCommandByNameOrAlias(commands, "NEW")?.name).toBe("new");
		expect(findSlashCommandByNameOrAlias(commands, "clear")?.name).toBe("new");
		expect(findSlashCommandByNameOrAlias(commands, "")).toBeNull();
	});
});
