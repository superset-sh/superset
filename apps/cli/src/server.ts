#!/usr/bin/env node
import { type ChildProcess, spawn } from "node:child_process";
import chokidar from "chokidar";

let child: ChildProcess | null = null;

function startApp() {
	if (child) {
		child.kill();
	}

	child = spawn("bun", ["dist/cli.js"], {
		stdio: "inherit",
		shell: false,
	});

	child.on("exit", (code) => {
		if (code !== null && code !== 0 && code !== 130) {
		}
	});
}

const watcher = chokidar.watch("dist/**/*", {
	ignoreInitial: false,
	persistent: true,
});

watcher.on("ready", () => {
	startApp();
});

watcher.on("change", (_path) => {
	startApp();
});

process.on("SIGINT", () => {
	if (child) {
		child.kill();
	}
	process.exit(0);
});
