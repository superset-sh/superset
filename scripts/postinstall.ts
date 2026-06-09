import { spawnSync } from "node:child_process";

if (process.env.SUPERSET_POSTINSTALL_RUNNING) {
	process.exit(0);
}

process.env.SUPERSET_POSTINSTALL_RUNNING = "1";

function run(command: string, args: string[]): void {
	const result = spawnSync(command, args, {
		stdio: "inherit",
		shell: false,
		env: process.env,
	});

	if (result.error) {
		console.error(
			`[postinstall] Failed to run ${command}: ${result.error.message}`,
		);
		process.exit(1);
	}

	if (result.status !== 0) {
		process.exit(result.status ?? 1);
	}
}

run("bun", ["x", "sherif"]);

if (process.env.CI) {
	process.exit(0);
}

run("bun", ["run", "--filter=@superset/desktop", "install:deps"]);
