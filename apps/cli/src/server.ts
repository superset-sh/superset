#!/usr/bin/env node
import { type ChildProcess, spawn } from "node:child_process";
import chokidar from "chokidar";

let child: ChildProcess | null = null;

function startApp() {
	if (child) {
		child.kill();
	}

	console.log("\x1b[36m[watch] Starting app...\x1b[0m");
	child = spawn("bun", ["dist/cli.js"], {
		stdio: "inherit",
		shell: false,
	});

	child.on("exit", (code) => {
		if (code !== null && code !== 0 && code !== 130) {
			console.log(`\x1b[33m[watch] App exited with code ${code}\x1b[0m`);
		}
	});
}

const watcher = chokidar.watch("dist/**/*", {
	ignoreInitial: false,
	persistent: true,
});

watcher.on("ready", () => {
	console.log("\x1b[36m[watch] Watching dist/ for changes...\x1b[0m");
	startApp();
});

watcher.on("change", (path) => {
	console.log(`\x1b[36m[watch] File changed: ${path}\x1b[0m`);
	startApp();
});

process.on("SIGINT", () => {
	if (child) {
		child.kill();
	}
	process.exit(0);
});
