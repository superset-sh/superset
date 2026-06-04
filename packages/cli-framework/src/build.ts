import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadConfig } from "./config";
import { createCommandsPlugin } from "./plugin";

export async function runBuild(argv: string[]): Promise<void> {
	const { config, configPath, root } = await loadConfig(process.cwd());
	const commandsDir = resolve(root, config.commandsDir);

	let target: Bun.Build.CompileTarget | undefined;
	let outfile = resolve(root, config.outfile ?? `./dist/${config.name}`);
	for (const arg of argv) {
		if (arg.startsWith("--target=")) {
			target = arg.slice("--target=".length) as Bun.Build.CompileTarget;
		} else if (arg.startsWith("--outfile=")) {
			outfile = resolve(root, arg.slice("--outfile=".length));
		}
	}

	const cacheDir = resolve(root, "node_modules/.cache/cli-framework");
	mkdirSync(cacheDir, { recursive: true });
	const entryPath = resolve(cacheDir, "entry.ts");
	writeFileSync(
		entryPath,
		`import config from ${JSON.stringify(configPath)};
import { commands, groups, middleware } from ${JSON.stringify(`${commandsDir}/index.ts`)};
import { run } from "@superset/cli-framework";

await run({
	name: config.name,
	version: config.version,
	tree: { commands, groups, middleware },
	globals: config.globals,
});
`,
	);

	const result = await Bun.build({
		entrypoints: [entryPath],
		plugins: [createCommandsPlugin({ commandsDir })],
		compile: target ? { target, outfile } : { outfile },
		define: config.define,
	});

	if (!result.success) {
		for (const log of result.logs) console.error(log);
		process.exit(1);
	}
	console.log(`[cli-framework] wrote ${outfile}`);
}
