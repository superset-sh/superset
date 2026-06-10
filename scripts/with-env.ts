import { spawnSync } from "node:child_process";

const [name, value, command, ...args] = process.argv.slice(2);

if (!name || value === undefined || !command) {
	console.error(
		"Usage: bun run scripts/with-env.ts <NAME> <VALUE> <command> [...args]",
	);
	process.exit(1);
}

const result = spawnSync(command, args, {
	stdio: "inherit",
	shell: false,
	env: { ...process.env, [name]: value },
});

if (result.error) {
	console.error(`[with-env] Failed to run ${command}: ${result.error.message}`);
	process.exit(1);
}

process.exit(result.status ?? 1);
