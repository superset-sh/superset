import { describe, expect, it } from "bun:test";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildTree, routeCommand } from "@superset/cli-framework";
import { Glob } from "bun";

const projectsDir = dirname(fileURLToPath(import.meta.url));

async function loadProjectsCommands() {
	const files = Array.from(
		new Glob("**/command.ts").scanSync({
			cwd: projectsDir,
			onlyFiles: true,
		}),
	).sort();
	const commands = [];
	for (const file of files) {
		const mod = (await import(`${projectsDir}/${file}`)) as {
			default: Parameters<typeof buildTree>[1][number]["command"];
		};
		commands.push({
			path: ["projects", ...file.split("/").slice(0, -1)],
			command: mod.default,
		});
	}
	return commands;
}

describe("superset projects subcommands", () => {
	it("ships a `create` subcommand on disk", () => {
		expect(existsSync(resolve(projectsDir, "create/command.ts"))).toBe(true);
	});

	it("routes `projects create` to a registered command", async () => {
		const commands = await loadProjectsCommands();
		const { root, commandMap } = buildTree([], commands);
		const { commandPath, remainingArgs } = routeCommand(root, [
			"projects",
			"create",
		]);
		expect(commandPath).toEqual(["projects", "create"]);
		expect(remainingArgs).toEqual([]);
		expect(commandMap.get(commandPath.join("/"))).toBeDefined();
	});
});
