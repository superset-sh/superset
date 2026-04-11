/**
 * Cross-platform postinstall (replaces postinstall.sh for Windows).
 * Keeps the same behavior: sherif validation, then desktop native deps (non-CI).
 */
import { spawnSync } from "node:child_process";
import { patchNodePtySpectreForWindows } from "./patch-node-pty-spectre-windows.ts";

if (process.env.SUPERSET_POSTINSTALL_RUNNING) {
	process.exit(0);
}
process.env.SUPERSET_POSTINSTALL_RUNNING = "1";

function run(cmd: string, args: string[]): number {
	const r = spawnSync(cmd, args, {
		stdio: "inherit",
		shell: process.platform === "win32",
		env: process.env,
	});
	return r.status ?? (r.error ? 1 : 0);
}

const sherifExit = run("bunx", ["sherif"]);
if (sherifExit !== 0) {
	process.exit(sherifExit);
}

if (process.env.CI) {
	process.exit(0);
}

patchNodePtySpectreForWindows();

const depsExit = run("bun", [
	"run",
	"--filter=@superset/desktop",
	"install:deps",
]);
process.exit(depsExit);
