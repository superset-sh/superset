#!/usr/bin/env bun
/**
 * Upgrade Claude Code binary to the latest version.
 *
 * This script:
 * 1. Downloads the latest Claude Code binary for darwin-arm64
 * 2. Stages the updated binary in git
 *
 * Usage:
 *   bun run scripts/upgrade-claude-binary.ts
 *   bun run scripts/upgrade-claude-binary.ts --version=2.1.31  # Specific version
 *
 * After running, commit the changes:
 *   git commit -m "chore: upgrade claude binary to vX.X.X"
 */

import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";

const SCRIPT_DIR = import.meta.dirname;
const DESKTOP_DIR = dirname(SCRIPT_DIR);
const BIN_DIR = join(DESKTOP_DIR, "resources", "bin");

function run(cmd: string, opts?: { cwd?: string }): string {
	return execSync(cmd, {
		encoding: "utf-8",
		cwd: opts?.cwd ?? DESKTOP_DIR,
		stdio: ["inherit", "pipe", "inherit"],
	}).trim();
}

async function main() {
	const args = process.argv.slice(2);
	const versionArg = args.find((a) => a.startsWith("--version="));
	const versionFlag = versionArg ? ` ${versionArg}` : "";

	// Get current version if exists
	const versionFile = join(BIN_DIR, "VERSION");
	if (existsSync(versionFile)) {
		const _currentVersion = readFileSync(versionFile, "utf-8")
			.split("\n")[0]
			.trim();
	} else {
	}

	// Download darwin-arm64 only (tracked with Git LFS)
	// Other platforms are downloaded at build time
	run(`bun run scripts/download-claude-binary.ts${versionFlag}`);

	// Get new version
	const _newVersion = readFileSync(versionFile, "utf-8").split("\n")[0].trim();

	// Stage the binary
	run("git add resources/bin/darwin-arm64/claude");

	// Show status
	const _status = run("git status --short resources/bin/darwin-arm64/");
}

main().catch((error) => {
	console.error("Fatal error:", error);
	process.exit(1);
});
