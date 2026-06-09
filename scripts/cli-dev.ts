import { spawnSync } from "node:child_process";

const env = {
	...process.env,
	SUPERSET_API_URL:
		process.env.SUPERSET_API_URL || process.env.NEXT_PUBLIC_API_URL || "",
};

const result = spawnSync(
	"bun",
	["x", "cli-framework", "dev", ...process.argv.slice(2)],
	{
		stdio: "inherit",
		shell: false,
		env,
	},
);

if (result.error) {
	console.error(
		`[cli-dev] Failed to run cli-framework: ${result.error.message}`,
	);
	process.exit(1);
}

process.exit(result.status ?? 1);
