#!/usr/bin/env node
// pty-daemon entrypoint. Runs under Node (node-pty + Bun's tty.ReadStream
// don't get along; see the design doc).
//
// Usage:
//   pty-daemon --socket=/path/to/sock [--buffer-bytes=65536]
//
// Logs go to stderr; nothing on stdout.

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { Server } from "./Server/index.ts";

interface CliArgs {
	socket: string;
	bufferBytes?: number;
}

function parseArgs(argv: string[]): CliArgs {
	const args: Partial<CliArgs> = {};
	for (const arg of argv) {
		if (arg.startsWith("--socket="))
			args.socket = arg.slice("--socket=".length);
		else if (arg.startsWith("--buffer-bytes=")) {
			args.bufferBytes = Number.parseInt(
				arg.slice("--buffer-bytes=".length),
				10,
			);
		}
	}
	if (!args.socket) {
		throw new Error("--socket=PATH is required");
	}
	return args as CliArgs;
}

async function main(): Promise<void> {
	const args = parseArgs(process.argv.slice(2));
	const daemonVersion = readPackageVersion();
	const server = new Server({
		socketPath: args.socket,
		daemonVersion,
		bufferCap: args.bufferBytes,
	});
	await server.listen();
	process.stderr.write(
		`[pty-daemon] listening on ${args.socket} (v${daemonVersion}, host=${os.hostname()})\n`,
	);

	const shutdown = async (signal: NodeJS.Signals) => {
		process.stderr.write(`[pty-daemon] received ${signal}, shutting down\n`);
		await server.close();
		process.exit(0);
	};
	process.on("SIGINT", () => void shutdown("SIGINT"));
	process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

function readPackageVersion(): string {
	try {
		const here = path.dirname(fileURLToPath(import.meta.url));
		const pkgPath = path.resolve(here, "..", "package.json");
		const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8")) as {
			version?: string;
		};
		return pkg.version ?? "0.0.0";
	} catch {
		return "0.0.0";
	}
}

main().catch((err) => {
	process.stderr.write(`[pty-daemon] fatal: ${(err as Error).stack ?? err}\n`);
	process.exit(1);
});
