#!/usr/bin/env bun
import { runBuild } from "./build";
import { runDev } from "./dev";

const [cmd, ...rest] = process.argv.slice(2);

if (cmd === "dev") {
	await runDev(rest);
} else if (cmd === "build") {
	await runBuild(rest);
} else {
	console.error("Usage: cli-framework <dev|build> [args...]");
	process.exit(1);
}
