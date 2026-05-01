#!/usr/bin/env node
// pty-daemon entrypoint. Runs under Node (node-pty + Bun's tty.ReadStream
// don't get along; see the design doc).
//
// Usage (fresh spawn):
//   pty-daemon --socket=/path/to/sock [--buffer-bytes=65536]
//
// Usage (handoff successor — invoked indirectly by a predecessor daemon):
//   env SUPERSET_PTY_DAEMON_HANDOFF=1
//       SUPERSET_PTY_DAEMON_SNAPSHOT=/path/to/snapshot.json
//       SUPERSET_PTY_DAEMON_SOCKET=/path/to/sock
//       pty-daemon
//   (PTY master fds are inherited via stdio; control fd is 'ipc'.)
//
// Logs go to stderr; nothing on stdout.

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import type { HandoffMessage } from "./protocol/index.ts";
import { Server } from "./Server/index.ts";
import { clearSnapshot, readSnapshot } from "./SessionStore/index.ts";

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
	if (process.env.SUPERSET_PTY_DAEMON_HANDOFF === "1") {
		await runHandoffReceiver();
		return;
	}
	await runFresh();
}

async function runFresh(): Promise<void> {
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
	wireShutdown(server);
}

/**
 * Phase 2: this process was spawned by a predecessor daemon to take over
 * its sessions. The predecessor passed PTY master fds via stdio
 * inheritance and set up an IPC channel for the upgrade-ack handshake.
 */
async function runHandoffReceiver(): Promise<void> {
	const snapshotPath = process.env.SUPERSET_PTY_DAEMON_SNAPSHOT;
	const socketPath = process.env.SUPERSET_PTY_DAEMON_SOCKET;
	if (!snapshotPath) throw new Error("SUPERSET_PTY_DAEMON_SNAPSHOT not set");
	if (!socketPath) throw new Error("SUPERSET_PTY_DAEMON_SOCKET not set");
	if (typeof process.send !== "function") {
		throw new Error("handoff receiver requires an IPC channel (process.send)");
	}

	const daemonVersion =
		process.env.SUPERSET_PTY_DAEMON_VERSION ?? readPackageVersion();

	const snapshot = readSnapshot(snapshotPath);
	const server = new Server({ socketPath, daemonVersion });

	try {
		server.adoptSnapshot(snapshot);
	} catch (err) {
		const nak: HandoffMessage = {
			type: "upgrade-nak",
			reason: `adopt failed: ${(err as Error).message}`,
		};
		process.send?.(nak);
		// Give Node a moment to flush the IPC frame, then exit non-zero.
		setTimeout(() => process.exit(1), 50).unref();
		return;
	}

	// Tell predecessor we adopted; it will close its socket + exit.
	const ack: HandoffMessage = {
		type: "upgrade-ack",
		successorPid: process.pid,
	};
	process.send?.(ack);

	// Wait for the predecessor to fully exit before we bind. Without this
	// wait, the predecessor's `server.close()` (which unlinks the socket
	// path) can race our `listen()` call: we'd bind successfully but then
	// the predecessor's unlink removes the path entry under us, and the
	// follow-up chmod hits ENOENT. Predecessor exit closes its IPC channel
	// — Node delivers that as the 'disconnect' event on our side.
	await new Promise<void>((resolve) => {
		if (process.connected !== true) return resolve();
		process.once("disconnect", () => resolve());
		// Defense in depth: if disconnect doesn't arrive (unexpected), bind
		// anyway after a short bound. The retry-on-EADDRINUSE handles any
		// remaining race.
		setTimeout(() => resolve(), 1_000).unref();
	});

	await server.listenWithRetry();
	process.stderr.write(
		`[pty-daemon] (handoff successor) listening on ${socketPath} (v${daemonVersion}, host=${os.hostname()}, sessions=${snapshot.sessions.length})\n`,
	);

	clearSnapshot(snapshotPath);
	wireShutdown(server);
}

function wireShutdown(server: Server): void {
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
