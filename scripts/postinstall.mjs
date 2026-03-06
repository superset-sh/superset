/**
 * Cross-platform postinstall script.
 *
 * Replaces the bash-only postinstall.sh so that `bun install` works on
 * Windows, macOS and Linux without special flags.
 *
 * Steps:
 *  1. Guard against infinite recursion (electron-builder install-app-deps
 *     can trigger nested bun installs which would re-run this script).
 *  2. Run sherif for workspace validation.
 *  3. Install native dependencies for the desktop app.
 */

import { execSync } from "node:child_process";

// Prevent infinite recursion during postinstall
if (process.env.SUPERSET_POSTINSTALL_RUNNING) {
	process.exit(0);
}
process.env.SUPERSET_POSTINSTALL_RUNNING = "1";

const env = { ...process.env, SUPERSET_POSTINSTALL_RUNNING: "1" };

/** Run a command, inheriting stdio so output is visible. */
function run(cmd) {
	execSync(cmd, { stdio: "inherit", env });
}

/** Run a command but don't fail if it errors (for optional native deps on Windows). */
function tryRun(cmd, label) {
	try {
		execSync(cmd, { stdio: "inherit", env });
	} catch {
		console.warn(`[postinstall] ${label} failed (non-fatal on Windows) — continuing`);
	}
}

// Run sherif for workspace validation
run("sherif");

// Install native dependencies for desktop app.
// On Windows, native module compilation may fail if Visual Studio Build Tools
// are not installed. This is non-fatal — prebuilt binaries will be used when available.
if (process.platform === "win32") {
	tryRun("bun run --filter=@superset/desktop install:deps", "install:deps");
} else {
	run("bun run --filter=@superset/desktop install:deps");
}
