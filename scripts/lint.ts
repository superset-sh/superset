// scripts/lint.ts
// Cross-platform replacement for lint.sh
// Wrapper for biome check that fails on ANY diagnostic (info, warn, or error)

import { $ } from "bun";

const args = process.argv.slice(2);

const result = await $`bunx biome check ${args}`.nothrow().quiet();
const output = result.stdout.toString() + result.stderr.toString();

console.log(output);

// Check if there are any diagnostics (errors, warnings, or infos)
if (/Found \d+ (error|info|warning)/.test(output)) {
	process.exit(1);
}

process.exit(result.exitCode);
