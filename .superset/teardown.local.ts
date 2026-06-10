#!/usr/bin/env bun
import { spawnSync } from "node:child_process";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const rootDir = join(scriptDir, "..");
process.chdir(rootDir);

const dryRun = process.argv.includes("--dry-run");
const help = process.argv.includes("-h") || process.argv.includes("--help");

if (help) {
	console.log(`Usage: bun ./.superset/teardown.local.ts [--dry-run]

Removes this workspace's local Docker DB stack and volume.
`);
	process.exit(0);
}

const workspaceName =
	process.env.SUPERSET_WORKSPACE_NAME || basename(process.cwd());
const project = `superset-${sanitizeName(workspaceName)}`;

console.log(`Tearing down local DB stack (${project})...`);
if (dryRun) {
	console.log(
		`[dry-run] docker compose -p ${project} -f ${join(rootDir, "docker-compose.yml")} down -v`,
	);
	process.exit(0);
}

const result = spawnSync(
	"docker",
	[
		"compose",
		"-p",
		project,
		"-f",
		join(rootDir, "docker-compose.yml"),
		"down",
		"-v",
	],
	{ cwd: rootDir, stdio: "inherit", env: process.env, shell: false },
);

if (result.error) {
	console.warn(
		`[warn] docker compose down could not start: ${result.error.message}`,
	);
	process.exit(0);
}

if (result.status === 0) {
	console.log(`[ok] Local DB stack removed (${project})`);
} else {
	console.warn(
		"[warn] docker compose down reported an issue - stack may already be gone",
	);
}

function sanitizeName(value: string): string {
	return value
		.toLowerCase()
		.replace(/[^a-z0-9._-]/g, "-")
		.replace(/-+/g, "-")
		.replace(/^-|-$/g, "")
		.slice(0, 48);
}
