/**
 * Bundles the pty-daemon entry point into a single JS file executable by a
 * standalone Node.js runtime (matches packages/host-service/build.ts). Native
 * addons (node-pty) are marked external and resolved from the desktop app's
 * lib/native/ at runtime.
 *
 * Production: Electron spawns the daemon via process.execPath (its bundled
 * Node), exactly like host-service. No Bun in the production bundle.
 */
import { existsSync, mkdirSync } from "node:fs";

const outdir = "dist";
if (!existsSync(outdir)) {
	mkdirSync(outdir, { recursive: true });
}

const result = await Bun.build({
	entrypoints: ["src/main.ts"],
	target: "node",
	outdir,
	naming: "pty-daemon.js",
	format: "esm",
	external: ["node-pty"],
});

if (!result.success) {
	console.error("[pty-daemon] build failed:");
	for (const log of result.logs) {
		console.error(log);
	}
	process.exit(1);
}
