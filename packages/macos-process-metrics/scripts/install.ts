import { spawnSync } from "node:child_process";

if (process.platform !== "darwin") {
	console.log("[macos-process-metrics] Native build skipped on non-macOS.");
	process.exit(0);
}

const result = spawnSync("node-gyp", ["rebuild"], {
	env: process.env,
	shell: false,
	stdio: "inherit",
});

if (result.error) {
	console.error(
		`[macos-process-metrics] Failed to run node-gyp: ${result.error.message}`,
	);
	process.exit(1);
}

process.exit(result.status ?? 1);
