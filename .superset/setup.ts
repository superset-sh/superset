#!/usr/bin/env bun
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const rootDir = join(scriptDir, "..");
const args = process.argv.slice(2);

const command =
	process.platform === "win32"
		? { bin: "bun", args: [join(scriptDir, "setup.local.ts"), ...args] }
		: { bin: "bash", args: [join(scriptDir, "setup.sh"), ...args] };

const result = spawnSync(command.bin, command.args, {
	cwd: rootDir,
	stdio: "inherit",
	env: process.env,
	shell: false,
});

if (result.error) {
	console.error(result.error.message);
	process.exit(1);
}
process.exit(result.status ?? 1);
