import { describe, expect, it } from "bun:test";
import type { CommandConfig } from "./command";
import { type CliCommand, type CliGroup, filterByAudience } from "./router";

function cmd(
	path: string[],
	audience?: CommandConfig["audience"],
	sandbox?: CommandConfig["sandbox"],
): CliCommand {
	return {
		path,
		command: {
			description: path.join(" "),
			audience,
			sandbox,
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
		cmd(["tasks", "purge", "all"]),
		cmd(["lab", "try"], "internal"),
	];
	const publicView = filterByAudience(groups, commands, ["public"]);

	it("shows only commands with no internal node in their chain", () => {
		expect(paths(publicView.commands)).toEqual(["tasks list"]);
		expect(paths(publicView.groups)).toEqual(["tasks"]);
	});

	it("keeps everything under an internal group internal, even when tagged public", () => {
		expect(paths(publicView.commands)).not.toContain("plugins search");
		expect(paths(publicView.commands)).not.toContain("plugins author init");
	});

	it("hides commands nested under an internal command", () => {
		expect(paths(publicView.commands)).not.toContain("tasks purge all");
	});

	it("keeps everything when internal is enabled", () => {
		const result = filterByAudience(groups, commands, ["internal", "public"]);
		expect(paths(result.commands)).toEqual(paths(commands));
		expect(result.groups).toEqual(groups);
	});
});

describe("filterByAudience inside a cloud workspace", () => {
	const groups: CliGroup[] = [
		{ path: ["plugins"], description: "Plugins" },
		{ path: ["hosts"], description: "Hosts", sandbox: false },
	];
	const commands = [
		cmd(["plugins", "list"]),
		cmd(["plugins", "install"], undefined, false),
		cmd(["hosts", "list"]),
		cmd(["auth", "login"], "public", false),
	];

	it("shows everything outside a cloud workspace", () => {
		const outside = filterByAudience(groups, commands, ["public"]);
		expect(paths(outside.commands)).toEqual(paths(commands));
	});

	it("hides sandbox: false commands and groups inside one", () => {
		const inside = filterByAudience(groups, commands, ["public"], true);
		expect(paths(inside.commands)).toEqual(["plugins list"]);
		expect(paths(inside.groups)).toEqual(["plugins"]);
	});
});
