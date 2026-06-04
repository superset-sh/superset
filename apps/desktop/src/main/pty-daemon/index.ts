/**
 * pty-daemon — Desktop bundle target
 *
 * The supervisor (in @superset/host-service) spawns this script as the
 * daemon process. We need a desktop-side entry so electron-vite emits
 * `apps/desktop/dist/main/pty-daemon.js` alongside `host-service.js` —
 * the supervisor's `sideBySide` script-path resolution looks for the
 * daemon binary right next to its own bundle.
 *
 * Two entry paths share this bundle:
 *   1. fresh-spawn: `pty-daemon --socket=...` (supervisor invokes this
 *      on first boot or after a restart).
 *   2. handoff-receiver: `pty-daemon --handoff --snapshot=... --socket=...`
 *      (predecessor daemon invokes this to spawn its successor and
 *      hand over PTY master fds via stdio inheritance + IPC ack).
 *
 * Important: the mode signal is `process.argv.includes("--handoff")`,
 * NOT an env var. electron-vite's esbuild does aggressive DCE on
 * `process.env.X === "Y"` patterns at build time — we lose the
 * receiver branch entirely. argv is fully dynamic and survives.
 *
 * The actual daemon implementation lives in `@superset/pty-daemon`
 * (Server, snapshot helpers). This file is the entry shim that
 * mirrors the package's main.ts logic — they're kept in sync by hand
 * because the dual-toolchain (Bun-built package vs electron-vite-bundled
 * desktop) catches different bundler quirks.
 *
 * Headless deploy path: in a non-Electron build, this file is unused —
 * the supervisor instead spawns the @superset/pty-daemon package's
 * built-in main.ts directly.
 */

import {
	clearSnapshot,
	DAEMON_PACKAGE_VERSION,
	readSnapshot,
	Server,
} from "@superset/pty-daemon";
import type { HandoffMessage } from "@superset/pty-daemon/protocol";

interface CliArgs {
	socket: string;
	bufferBytes?: number;
}

function parseFreshArgs(argv: string[]): CliArgs {
	const args: Partial<CliArgs> = {};
	for (const arg of argv) {
		if (arg.startsWith("--socket=")) {
			args.socket = arg.slice("--socket=".length);
		} else if (arg.startsWith("--buffer-bytes=")) {
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
	if (process.argv.includes("--handoff")) {
		await runHandoffReceiver();
		return;
	}
	await runFresh();
}

async function runFresh(): Promise<void> {
	const args = parseFreshArgs(process.argv.slice(2));
	// Env wins so the supervisor can pin versions; falls back to the bundle.
	const daemonVersion =
		process.env.SUPERSET_PTY_DAEMON_VERSION ?? DAEMON_PACKAGE_VERSION;
	const server = new Server({
		socketPath: args.socket,
		daemonVersion,
		bufferCap: args.bufferBytes,
	});
	await server.listen();
	process.stderr.write(
		`[pty-daemon] listening on ${args.socket} (v${daemonVersion})\n`,
	);
	wireShutdown(server);
}

async function runHandoffReceiver(): Promise<void> {
	const log = (msg: string) =>
		process.stderr.write(
			`[pty-daemon handoff-recv pid=${process.pid}] ${msg}\n`,
		);

	log("entered runHandoffReceiver");
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

	// Ignore env in handoff mode — see packages/pty-daemon/src/main.ts.
	const daemonVersion = DAEMON_PACKAGE_VERSION;
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
		setTimeout(() => process.exit(1), 50).unref();
		return;
	}

	log(`sending upgrade-ack`);
	const ack: HandoffMessage = {
		type: "upgrade-ack",
		successorPid: process.pid,
	};
	process.send?.(ack);

	log(`waiting for predecessor disconnect`);
	await new Promise<void>((resolve) => {
		if (process.connected !== true) return resolve();
		process.once("disconnect", () => resolve());
		// Defense in depth: bind anyway after a short bound; the
		// retry-on-EADDRINUSE inside listenWithRetry covers any race.
		setTimeout(() => resolve(), 1_000).unref();
	});
	log(`predecessor disconnected, binding socket`);

	await server.listenWithRetry();
	log(`bound and listening`);

	clearSnapshot(snapshotPath);
	wireShutdown(server);
}

function wireShutdown(server: Server): void {
	let shuttingDown = false;
	const shutdown = async (signal: NodeJS.Signals) => {
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
			process.exit(0);
		}
	};
	process.on("SIGINT", () => void shutdown("SIGINT"));
	process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

void main().catch((error) => {
	process.stderr.write(
		`[pty-daemon] failed to start: ${(error as Error).stack ?? error}\n`,
	);
	process.exit(1);
});
