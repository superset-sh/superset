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
	console.log(`$ ${cmd}`);
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

	console.log("Claude Code Binary Upgrader");
	console.log("===========================\n");

	// Get current version if exists
	const versionFile = join(BIN_DIR, "VERSION");
	if (existsSync(versionFile)) {
		const currentVersion = readFileSync(versionFile, "utf-8")
			.split("\n")[0]
			.trim();
		console.log(`Current version: ${currentVersion}`);
	} else {
		console.log("No existing binaries found");
	}

	// Download darwin-arm64 only (tracked with Git LFS)
	// Other platforms are downloaded at build time
	console.log("\nDownloading binary for darwin-arm64...\n");
	run(`bun run scripts/download-claude-binary.ts${versionFlag}`);

	// Get new version
	const newVersion = readFileSync(versionFile, "utf-8").split("\n")[0].trim();
	console.log(`\nNew version: ${newVersion}`);

	// Stage the binary
	console.log("\nStaging binary in git...");
	run("git add resources/bin/darwin-arm64/claude");

	// Show status
	console.log("\nGit status:");
	const status = run("git status --short resources/bin/darwin-arm64/");
	console.log(status || "  (no changes)");

	console.log("\n✓ Upgrade complete!");
	console.log("\nNext steps:");
	console.log(
		`  git commit -m "chore: upgrade claude binary to v${newVersion}"`,
	);
	console.log("  git push");
}

main().catch((error) => {
	console.error("Fatal error:", error);
	process.exit(1);
});
