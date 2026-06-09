import { spawnSync } from "node:child_process";

const passthroughArgs = process.argv.slice(2);
const hasConcurrencyArg = passthroughArgs.some(
	(arg, index) =>
		arg === "--concurrency" ||
		arg.startsWith("--concurrency=") ||
		passthroughArgs[index - 1] === "--concurrency",
);
const windowsConcurrency =
	process.env.SUPERSET_TYPECHECK_CONCURRENCY?.trim() || "4";

const args = ["x", "turbo", "typecheck", ...passthroughArgs];
if (process.platform === "win32" && !hasConcurrencyArg) {
	args.push("--concurrency", windowsConcurrency);
}

const result = spawnSync("bun", args, {
	env: process.env,
	stdio: "inherit",
});

if (result.error) {
	console.error(`[typecheck] Failed to run turbo: ${result.error.message}`);
	process.exit(1);
}

process.exit(result.status ?? 1);
