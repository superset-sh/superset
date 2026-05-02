import { resolve } from "node:path";
import { Glob } from "bun";
import { loadConfig } from "./config";
import type { MiddlewareFn } from "./middleware";
import type { CliCommand, CliGroup } from "./router";
import { run } from "./runner";

export async function runDev(argv: string[]): Promise<void> {
	const { config, root } = await loadConfig(process.cwd());
	const commandsDir = resolve(root, config.commandsDir);

	const commandFiles = Array.from(
		new Glob("**/command.ts").scanSync({
			cwd: commandsDir,
			onlyFiles: true,
		}),
	).sort();
	const metaFiles = Array.from(
		new Glob("**/meta.ts").scanSync({
			cwd: commandsDir,
			onlyFiles: true,
		}),
	).sort();

	const commands: CliCommand[] = [];
	for (const file of commandFiles) {
		const mod = (await import(`${commandsDir}/${file}`)) as {
			default: CliCommand["command"];
		};
		commands.push({
			path: file.split("/").slice(0, -1),
			command: mod.default,
		});
	}

	const groups: CliGroup[] = [];
	for (const file of metaFiles) {
		const mod = (await import(`${commandsDir}/${file}`)) as {
			default: Omit<CliGroup, "path">;
		};
		groups.push({
			path: file.split("/").slice(0, -1),
			...mod.default,
		});
	}

	let middleware: MiddlewareFn | undefined;
	const middlewarePath = `${commandsDir}/middleware.ts`;
	if (await Bun.file(middlewarePath).exists()) {
		const mod = (await import(middlewarePath)) as { default: MiddlewareFn };
		middleware = mod.default;
	}

	process.argv = [process.argv[0] ?? "", process.argv[1] ?? "", ...argv];

	await run({
		name: config.name,
		version: config.version,
		tree: { commands, groups, middleware },
		globals: config.globals,
	});
}
