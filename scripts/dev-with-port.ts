import { spawnSync } from "node:child_process";

const [envName, defaultPort, command, ...args] = process.argv.slice(2);

if (!envName || !defaultPort || !command) {
	console.error(
		"Usage: bun run scripts/dev-with-port.ts <ENV_NAME> <DEFAULT_PORT> <command> [...args]",
	);
	process.exit(1);
}

const port = process.env[envName] || defaultPort;
const result = spawnSync("bun", ["x", command, ...args, "--port", port], {
	stdio: "inherit",
	shell: false,
	env: process.env,
});

if (result.error) {
	console.error(
		`[dev-with-port] Failed to run ${command}: ${result.error.message}`,
	);
	process.exit(1);
}

process.exit(result.status ?? 1);
