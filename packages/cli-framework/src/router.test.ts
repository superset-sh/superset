import { describe, expect, it } from "bun:test";
import type { CommandConfig } from "./command";
import { type CliCommand, type CliGroup, filterByAudience } from "./router";

function cmd(path: string[], audience?: CommandConfig["audience"]): CliCommand {
	return {
		path,
		command: {
			description: path.join(" "),
			audience,
			run: async () => undefined,
		},
	};
}

const paths = (commands: CliCommand[]) => commands.map((c) => c.path.join(" "));

describe("filterByAudience", () => {
	const groups: CliGroup[] = [
		{ path: ["pages"], description: "Pages", audience: "internal" },
		{ path: ["tasks"], description: "Tasks" },
		{ path: ["lab"], description: "Lab" },
	];
	const commands = [
		cmd(["pages", "list"]),
		cmd(["tasks", "list"]),
		cmd(["tasks", "purge"], "internal"),
		cmd(["lab", "try"], "internal"),
	];

	it("drops internal commands and their groups for the public audience", () => {
		const result = filterByAudience(groups, commands, ["public"]);
		expect(paths(result.commands)).toEqual(["tasks list"]);
		expect(result.groups.map((g) => g.path.join(" "))).toEqual(["tasks"]);
	});

	it("keeps everything when internal is enabled", () => {
		const result = filterByAudience(groups, commands, ["internal", "public"]);
		expect(paths(result.commands)).toEqual(paths(commands));
		expect(result.groups).toEqual(groups);
	});

	it("hides a public command under an internal group", () => {
		const result = filterByAudience(groups, commands, ["public"]);
		expect(paths(result.commands)).not.toContain("pages list");
	});
});
