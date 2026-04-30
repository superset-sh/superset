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
			const raw = arg.slice("--buffer-bytes=".length);
			const parsed = Number.parseInt(raw, 10);
			if (!Number.isFinite(parsed) || parsed <= 0) {
				throw new Error(
					`--buffer-bytes must be a positive integer, got: ${raw}`,
				);
			}
			args.bufferBytes = parsed;
		}
	}
	if (!args.socket) {
		throw new Error("--socket=PATH is required");
	}
	return args as CliArgs;
}

async function main(): Promise<void> {
	const args = parseArgs(process.argv.slice(2));
	// Env takes precedence so the supervisor (or a test harness) can pin
	// the version to a known value. Falls back to the package.json read
	// when env is unset — that's the deployed-artifact source of truth.
	const daemonVersion =
		process.env.SUPERSET_PTY_DAEMON_VERSION ?? readPackageVersion();
	const server = new Server({
		socketPath: args.socket,
		daemonVersion,
		bufferCap: args.bufferBytes,
	});
	await server.listen();
	process.stderr.write(
		`[pty-daemon] listening on ${args.socket} (v${daemonVersion}, host=${os.hostname()})\n`,
	);

	let shuttingDown = false;
	const shutdown = async (signal: NodeJS.Signals) => {
		// Re-entry guard: a second SIGINT/SIGTERM during graceful close
		// should not double-call server.close() or change the exit code.
		if (shuttingDown) return;
		shuttingDown = true;
		process.stderr.write(`[pty-daemon] received ${signal}, shutting down\n`);
		try {
			await server.close();
		} catch (err) {
			process.stderr.write(
				`[pty-daemon] shutdown error: ${(err as Error).stack ?? err}\n`,
			);
		} finally {
			// Always exit deterministically, even if server.close() threw.
			process.exit(0);
		}
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
