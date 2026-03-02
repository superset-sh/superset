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

/** Run a command, inheriting stdio so output is visible. */
function run(cmd) {
	execSync(cmd, { stdio: "inherit" });
}

// Run sherif for workspace validation
run("sherif");

// Install native dependencies for desktop app
run("bun run --filter=@superset/desktop install:deps");
