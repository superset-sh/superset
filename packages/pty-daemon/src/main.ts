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
import * as path from "node:path";
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
	let handoffSocketPath: string | undefined;
	for (const arg of process.argv) {
		if (arg.startsWith("--snapshot=")) {
			snapshotPath = arg.slice("--snapshot=".length);
		} else if (arg.startsWith("--socket=")) {
			socketPath = arg.slice("--socket=".length);
		} else if (arg.startsWith("--handoff-socket=")) {
			handoffSocketPath = arg.slice("--handoff-socket=".length);
		}
	}
	if (!snapshotPath) throw new Error("--snapshot=PATH not set in argv");
	if (!socketPath) throw new Error("--socket=PATH not set in argv");
	const legacyPredecessor = handoffSocketPath === undefined;
	// Legacy predecessors did not pass a staging path. Derive one in the same
	// directory so rename-to-canonical remains atomic for the first old→new hop.
	handoffSocketPath ??= path.join(
		path.dirname(socketPath),
		`.ptyd-h-${process.pid}-${Date.now().toString(36)}.sock`,
	);
	if (typeof process.send !== "function") {
		throw new Error("handoff receiver requires an IPC channel (process.send)");
	}
	log(
		`snapshotPath=${snapshotPath} socketPath=${socketPath} handoffSocketPath=${handoffSocketPath}`,
	);

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
		sendHandoffMessage(nak, log);
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
		sendHandoffMessage(nak, log);
		// Give Node a moment to flush the IPC frame, then exit non-zero.
		setTimeout(() => process.exit(1), 50).unref();
		return;
	}

	// Prove that the successor can listen before the predecessor commits. This
	// private socket is atomically renamed to the canonical path after COMMIT.
	try {
		await server.listenForHandoff(handoffSocketPath);
	} catch (err) {
		const reason = `staging socket bind failed: ${(err as Error).message}`;
		log(reason);
		const nak: HandoffMessage = { type: "upgrade-nak", reason };
		sendHandoffMessage(nak, log);
		setTimeout(() => process.exit(1), 50).unref();
		return;
	}

	// Install the COMMIT waiter before READY is sent so a fast predecessor can
	// never beat our message listener.
	const commitPromise = waitForUpgradeCommit({ legacyPredecessor });
	log(`sending upgrade-ready`);
	const ready: HandoffMessage = {
		type: "upgrade-ready",
		successorPid: process.pid,
	};
	const readySent = sendHandoffMessage(ready, log);
	// Pre-two-phase predecessors ignore READY and wait specifically for ACK.
	// Sending both is safe: new predecessors ignore this compatibility frame.
	const legacyAck: HandoffMessage = {
		type: "upgrade-ack",
		successorPid: process.pid,
	};
	const legacyAckSent = sendHandoffMessage(legacyAck, log);
	if (!readySent && !legacyAckSent) {
		log("handoff IPC channel unavailable before READY");
		await server.close({ killSessions: false });
		process.exit(1);
		return;
	}

	let commitMode: "explicit" | "legacy-disconnect";
	try {
		commitMode = await commitPromise;
	} catch (err) {
		log(`handoff aborted before commit: ${(err as Error).message}`);
		await server.close({ killSessions: false });
		process.exit(1);
		return;
	}

	log(`${commitMode} commit received, publishing staged successor`);
	try {
		// New predecessors atomically rewrite this file with bytes that reached
		// their paused user-space stream after fd inheritance. Legacy predecessors
		// leave the original snapshot unchanged, so the same refresh is harmless.
		server.refreshAdoptedSnapshot(readSnapshot(snapshotPath));
		server.publishHandoffSocket(handoffSocketPath);
		// Keep readers staged until the host has subscribed. The subscription is
		// registered before activation, so bytes produced after the final snapshot
		// are delivered live instead of disappearing into an unsubscribed window.
		server.scheduleAdoptedSessionActivation();
	} catch (err) {
		const reason = `commit refresh/publish failed: ${(err as Error).message}`;
		log(reason);
		const nak: HandoffMessage = { type: "upgrade-nak", reason };
		sendHandoffMessage(nak, log);
		setTimeout(() => process.exit(1), 50).unref();
		return;
	}

	log(`canonical socket published and listening`);
	const listening: HandoffMessage = {
		type: "upgrade-listening",
		successorPid: process.pid,
	};
	// The canonical socket is authoritative now. Losing predecessor IPC at this
	// point must not crash a healthy successor or strand every terminal session.
	sendHandoffMessage(listening, log);
	process.stderr.write(
		`[pty-daemon] (handoff successor) listening on ${socketPath} (v${daemonVersion}, host=${os.hostname()}, sessions=${snapshot.sessions.length})\n`,
	);

	try {
		clearSnapshot(snapshotPath);
	} catch (error) {
		// The canonical socket is already published. Snapshot cleanup is no longer
		// part of ownership correctness and must never kill the active successor.
		log(`snapshot cleanup failed after publish: ${(error as Error).message}`);
	}
	wireShutdown(server);
}

const HANDOFF_COMMIT_TIMEOUT_MS = 10_000;
function waitForUpgradeCommit(opts: {
	legacyPredecessor: boolean;
}): Promise<"explicit" | "legacy-disconnect"> {
	return new Promise((resolve, reject) => {
		let settled = false;
		let timer: NodeJS.Timeout | null = null;
		const settle = (
			result?: "explicit" | "legacy-disconnect",
			error?: Error,
		) => {
			if (settled) return;
			settled = true;
			process.off("message", onMessage);
			process.off("disconnect", onDisconnect);
			if (timer) clearTimeout(timer);
			if (error) reject(error);
			else resolve(result ?? "explicit");
		};
		const onMessage = (raw: unknown) => {
			const message = raw as Partial<HandoffMessage>;
			if (message?.type === "upgrade-commit") settle("explicit");
		};
		const onDisconnect = () => {
			if (opts.legacyPredecessor) settle("legacy-disconnect");
			else
				settle(
					undefined,
					new Error("predecessor IPC disconnected before COMMIT"),
				);
		};
		process.on("message", onMessage);
		process.once("disconnect", onDisconnect);
		if (process.connected !== true) {
			onDisconnect();
			return;
		}
		timer = setTimeout(
			() =>
				settle(
					undefined,
					new Error(
						`predecessor commit timed out after ${HANDOFF_COMMIT_TIMEOUT_MS}ms`,
					),
				),
			HANDOFF_COMMIT_TIMEOUT_MS,
		);
	});
}

function sendHandoffMessage(
	message: HandoffMessage,
	log: (message: string) => void,
): boolean {
	if (typeof process.send !== "function" || process.connected !== true) {
		log(`IPC send skipped for ${message.type}: channel is disconnected`);
		return false;
	}
	try {
		process.send(message, (error) => {
			if (error) log(`IPC send failed for ${message.type}: ${error.message}`);
		});
		return true;
	} catch (error) {
		log(`IPC send threw for ${message.type}: ${(error as Error).message}`);
		return false;
	}
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
