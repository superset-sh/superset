#!/usr/bin/env bun
import { existsSync } from "node:fs";
import { boolean, cli, string } from "@superset/cli-framework";

// Detect if we're running from source (dev) or compiled binary
const commandsDir = new URL("./commands", import.meta.url).pathname;
const isCompiled = !existsSync(commandsDir);

if (isCompiled) {
	// Compiled binary — use static imports
	const { runStatic } = await import("./run-static");
	await runStatic();
} else {
	// Dev mode — use file-based routing
	await cli({
		name: "superset",
		version: "0.1.0",
		commands: commandsDir,
		globals: {
			json: boolean().desc("Output as JSON"),
			quiet: boolean().desc("Output IDs only"),
			device: string().env("SUPERSET_DEVICE").desc("Override device"),
		},
	});
}
