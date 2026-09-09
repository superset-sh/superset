#!/usr/bin/env bun
import { existsSync } from "node:fs";
import { join } from "node:path";
import {
	findMarketplace,
	resolvePlugins,
} from "../packages/cli/src/lib/plugins/marketplace";
import {
	checkPlugin,
	generatedManifestDrift,
} from "../packages/cli/src/lib/plugins/publish";

async function typecheck(
	plugin: ReturnType<typeof resolvePlugins>[number],
): Promise<{ name: string; problem: string }[]> {
	const dir = plugin.dir;
	if (!existsSync(join(dir, "tsconfig.json"))) return [];

	const result = Bun.spawnSync({
		cmd: ["bunx", "tsc", "--noEmit", "-p", "tsconfig.json"],
		cwd: dir,
		stdout: "pipe",
		stderr: "pipe",
	});
	if (result.success) return [];

	const output = [
		result.stdout.toString().trim(),
		result.stderr.toString().trim(),
	]
		.filter(Boolean)
		.join("\n");
	return [{ name: plugin.entry.name, problem: `tsc failed:\n${output}` }];
}

const ctx = findMarketplace();
const plugins = resolvePlugins(ctx);
const issues = [
	...(
		await Promise.all(plugins.map((plugin) => checkPlugin(ctx, plugin)))
	).flat(),
	...(await Promise.all(plugins.map(typecheck))).flat(),
	...generatedManifestDrift(ctx),
];

if (issues.length) {
	console.error(
		`${issues.length} plugin problem${issues.length === 1 ? "" : "s"}:`,
	);
	for (const issue of issues)
		console.error(`  ${issue.name}: ${issue.problem}`);
	process.exit(1);
}

console.log(`All plugins are valid and published.`);
