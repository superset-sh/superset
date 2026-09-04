#!/usr/bin/env bun
import {
	findMarketplace,
	resolvePlugins,
} from "../packages/cli/src/lib/plugins/marketplace";
import {
	checkPlugin,
	generatedManifestDrift,
} from "../packages/cli/src/lib/plugins/publish";

const ctx = findMarketplace();
const issues = [
	...(
		await Promise.all(
			resolvePlugins(ctx).map((plugin) => checkPlugin(ctx, plugin)),
		)
	).flat(),
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
