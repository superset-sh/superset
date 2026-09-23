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

const paths = (items: { path: string[] }[]) =>
	items.map((item) => item.path.join(" "));

describe("filterByAudience", () => {
	const groups: CliGroup[] = [
		{ path: ["plugins"], description: "Plugins", audience: "internal" },
		{
			path: ["plugins", "author"],
			description: "Authoring",
			audience: "public",
		},
		{ path: ["tasks"], description: "Tasks" },
		{ path: ["lab"], description: "Lab" },
	];
	const commands = [
		cmd(["plugins", "list"]),
		cmd(["plugins", "search"], "public"),
		cmd(["plugins", "author", "init"]),
		cmd(["tasks", "list"]),
		cmd(["tasks", "purge"], "internal"),
		cmd(["lab", "try"], "internal"),
	];

	it("hides internal commands, and groups left empty, for the public audience", () => {
		const result = filterByAudience(groups, commands, ["public"]);
		expect(paths(result.commands)).toEqual([
			"plugins search",
			"plugins author init",
			"tasks list",
		]);
		expect(paths(result.groups)).toEqual([
			"plugins",
			"plugins author",
			"tasks",
		]);
	});

	it("keeps everything when internal is enabled", () => {
		const result = filterByAudience(groups, commands, ["internal", "public"]);
		expect(paths(result.commands)).toEqual(paths(commands));
		expect(result.groups).toEqual(groups);
	});

	it("gives an untagged command its nearest group's audience", () => {
		const result = filterByAudience(groups, commands, ["public"]);
		expect(paths(result.commands)).not.toContain("plugins list");
		expect(paths(result.commands)).toContain("plugins author init");
	});

	it("lets a command's own tag override its group's", () => {
		const result = filterByAudience(groups, commands, ["public"]);
		expect(paths(result.commands)).toContain("plugins search");
		expect(paths(result.commands)).not.toContain("tasks purge");
	});
});
