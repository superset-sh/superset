#!/usr/bin/env node
// pty-daemon entrypoint. Runs under Node (node-pty + Bun's tty.ReadStream
// don't get along; see the design doc).
//
// Usage (fresh spawn):
//   pty-daemon --socket=/path/to/sock [--buffer-bytes=65536]
//
// Usage (handoff successor — invoked indirectly by a predecessor daemon):
//   pty-daemon --handoff --snapshot=/path/to/snapshot --socket=/path/to/sock
//   (PTY master fds are inherited via stdio; control fd is 'ipc'.)
//
// The mode signal must be on argv, NOT env: bundlers (Bun, esbuild) inline
// `process.env.X` references statically and DCE the unused branch — argv is
// fully dynamic and survives every bundler we run.
//
// Logs go to stderr; nothing on stdout.

import * as os from "node:os";
import packageJson from "../package.json" with { type: "json" };
import type { HandoffMessage } from "./protocol/index.ts";
import { Server } from "./Server/index.ts";
import { clearSnapshot, readSnapshot } from "./SessionStore/index.ts";

const DAEMON_VERSION: string = packageJson.version;

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
	// Mode signal goes through argv, NOT env. Bundlers (Bun, esbuild via
	// electron-vite) statically inline `process.env.<KEY>` references at
	// build time and constant-fold the comparison — bracket notation
	// `process.env["KEY"]` doesn't help; both bundlers see through it.
	// `process.argv` is fully dynamic, can't be statically analyzed, and
	// survives every bundler we run (handoff.test.ts, dev electron-vite,
	// prod desktop bundle). See plans note about bundler DCE.
	if (process.argv.includes("--handoff")) {
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
		process.env.SUPERSET_PTY_DAEMON_VERSION ?? DAEMON_VERSION;
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
	const log = (msg: string) =>
		process.stderr.write(
			`[pty-daemon handoff-recv pid=${process.pid}] ${msg}\n`,
		);

	log("entered runHandoffReceiver");
	// Pull snapshot + socket paths from argv (predecessor passes them as
	// --snapshot=... --socket=...). Args are bundler-opaque, env vars
	// aren't.
	let snapshotPath: string | undefined;
	let socketPath: string | undefined;
	for (const arg of process.argv) {
		if (arg.startsWith("--snapshot=")) {
			snapshotPath = arg.slice("--snapshot=".length);
		} else if (arg.startsWith("--socket=")) {
			socketPath = arg.slice("--socket=".length);
		}
	}
	if (!snapshotPath) throw new Error("--snapshot=PATH not set in argv");
	if (!socketPath) throw new Error("--socket=PATH not set in argv");
	if (typeof process.send !== "function") {
		throw new Error("handoff receiver requires an IPC channel (process.send)");
	}
	log(`snapshotPath=${snapshotPath} socketPath=${socketPath}`);

	// Ignore env in handoff mode: an old-bundle predecessor won't strip
	// SUPERSET_PTY_DAEMON_VERSION when spawning us, and trusting it
	// would make us report the predecessor's stale version forever.
	const daemonVersion = DAEMON_VERSION;
	log(`daemonVersion=${daemonVersion}`);

	let snapshot: ReturnType<typeof readSnapshot>;
	try {
		snapshot = readSnapshot(snapshotPath);
	} catch (err) {
		const reason = (err as Error).message;
		log(`SNAPSHOT READ FAILED: ${reason}`);
		const nak: HandoffMessage = {
			type: "upgrade-nak",
			reason: `snapshot read failed: ${reason}`,
		};
		process.send?.(nak);
		setTimeout(() => process.exit(1), 50).unref();
		return;
	}
	log(`read snapshot: sessions=${snapshot.sessions.length}`);
	const server = new Server({ socketPath, daemonVersion });

	try {
		log(`adopting ${snapshot.sessions.length} sessions`);
		server.adoptSnapshot(snapshot);
		log(`adopted successfully`);
	} catch (err) {
		const reason = (err as Error).stack ?? (err as Error).message;
		log(`ADOPT FAILED: ${reason}`);
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
	log(`sending upgrade-ack`);
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
	log(`waiting for predecessor disconnect`);
	await new Promise<void>((resolve) => {
		if (process.connected !== true) return resolve();
		process.once("disconnect", () => resolve());
		// Defense in depth: if disconnect doesn't arrive (unexpected), bind
		// anyway after a short bound. The retry-on-EADDRINUSE handles any
		// remaining race.
		setTimeout(() => resolve(), 1_000).unref();
	});
	log(`predecessor disconnected, binding socket`);

	await server.listenWithRetry();
	log(`bound and listening`);
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

main().catch((err) => {
	process.stderr.write(`[pty-daemon] fatal: ${(err as Error).stack ?? err}\n`);
	process.exit(1);
});
