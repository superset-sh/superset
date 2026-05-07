import { existsSync } from "node:fs";
import { StringDecoder } from "node:string_decoder";
import type { NodeWebSocket } from "@hono/node-ws";
import {
	createScanState,
	SHELLS_WITH_READY_MARKER,
	type ShellReadyScanState,
	scanForShellReady,
} from "@superset/shared/shell-ready-scanner";
import {
	createTerminalTitleScanState,
	scanForTerminalTitle,
	type TerminalTitleScanState,
} from "@superset/shared/terminal-title-scanner";
import { and, eq, ne } from "drizzle-orm";
import type { Hono } from "hono";
import type { HostDb } from "../db/index.ts";
import { projects, terminalSessions, workspaces } from "../db/schema.ts";
import type { EventBus } from "../events/index.ts";
import { portManager } from "../ports/port-manager.ts";
import type { DaemonClient } from "./DaemonClient/index.ts";
import {
	getDaemonClient,
	onDaemonDisconnect,
} from "./daemon-client-singleton.ts";
import {
	buildV2TerminalEnv,
	getShellLaunchArgs,
	getTerminalBaseEnv,
	resolveLaunchShell,
} from "./env.ts";

/**
 * Thin adapter exposing approximately the IPty surface that the rest of
 * this file (and teardown.ts) was built against, so most of the call
 * sites stay unchanged after the daemon extraction. The PTY itself lives
 * in pty-daemon; this is a remote control.
 *
 * onData / onExit register additional subscribers on top of whatever the
 * session's primary subscription is doing — daemon supports multi-
 * subscriber fan-out per session, so layered observers work fine.
 */
interface PtyDataDisposer {
	dispose(): void;
}

interface DaemonPty {
	pid: number;
	write(data: string): void;
	resize(cols: number, rows: number): void;
	kill(signal?: NodeJS.Signals): void;
	onData(cb: (data: string) => void): PtyDataDisposer;
	onExit(
		cb: (info: { exitCode: number; signal: number }) => void,
	): PtyDataDisposer;
}

function makeDaemonPty(
	daemon: DaemonClient,
	sessionId: string,
	pid: number,
): DaemonPty {
	return {
		pid,
		write(data) {
			daemon.input(sessionId, Buffer.from(data, "utf8"));
		},
		resize(cols, rows) {
			try {
				daemon.resize(sessionId, cols, rows);
			} catch {
				// Daemon may have disconnected; surface via the next op.
			}
		},
		kill(signal) {
			daemon
				.close(
					sessionId,
					(signal as "SIGTERM" | "SIGKILL" | "SIGINT" | "SIGHUP") ?? "SIGHUP",
				)
				.catch(() => {
					// Already gone or daemon disconnected — no-op.
				});
		},
		onData(cb) {
			// StringDecoder buffers partial UTF-8 sequences across chunks.
			// Without it `chunk.toString("utf8")` per chunk replaces the trailing
			// 1–3 bytes of any codepoint that straddles a boundary with U+FFFD —
			// the same bug we ripped out of the primary data path.
			const decoder = new StringDecoder("utf8");
			const unsub = daemon.subscribe(
				sessionId,
				{ replay: false },
				{
					onOutput: (chunk) => {
						const out = decoder.write(chunk);
						if (out.length > 0) cb(out);
					},
					onExit: () => {},
				},
			);
			return { dispose: unsub };
		},
		onExit(cb) {
			const unsub = daemon.subscribe(
				sessionId,
				{ replay: false },
				{
					onOutput: () => {},
					onExit: ({ code, signal }) =>
						cb({ exitCode: code ?? 0, signal: signal ?? 0 }),
				},
			);
			return { dispose: unsub };
		},
	};
}

interface RegisterWorkspaceTerminalRouteOptions {
	app: Hono;
	db: HostDb;
	eventBus: EventBus;
	upgradeWebSocket: NodeWebSocket["upgradeWebSocket"];
}

export function parseThemeType(
	value: string | null | undefined,
): "dark" | "light" | undefined {
	return value === "dark" || value === "light" ? value : undefined;
}

/**
 * Build the host-service tRPC URL for the v2 agent hook. The agent shell
 * script POSTs to this; host-service fans out on the event bus so the
 * renderer (web or electron) can play the finish sound.
 */
function getHostAgentHookUrl(): string {
	const port = process.env.HOST_SERVICE_PORT || process.env.PORT;
	if (!port) return "";
	return `http://127.0.0.1:${port}/trpc/notifications.hook`;
}

type TerminalClientMessage =
	| { type: "input"; data: string }
	| { type: "resize"; cols: number; rows: number }
	| { type: "dispose" };

// PTY output bytes travel as binary WebSocket frames — the renderer pipes
// the ArrayBuffer straight into xterm.write(Uint8Array) without any UTF-8
// decoding. Control messages stay JSON. Replay (the buffered prefix sent
// on attach) is a binary frame too; the renderer doesn't distinguish it
// from live data.
type TerminalServerMessage =
	| { type: "attached"; terminalId: string }
	| { type: "error"; message: string }
	| { type: "exit"; exitCode: number; signal: number }
	| { type: "title"; title: string | null };

// Replay buffer is sized to match the scrollback ring so a resurrect's
// carry-over isn't immediately trimmed by the new shell's startup output.
// Both cap memory growth on long-running detached sessions.
const MAX_BUFFER_BYTES = 256 * 1024;
const MAX_SCROLLBACK_BYTES = 256 * 1024;

/**
 * How long an exited (naturally or via killSession) terminal lingers in the
 * sessions map before being fully disposed. Long enough that a user can pick
 * it from the dropdown to start a fresh shell on the same terminalId; short
 * enough that the map doesn't grow without bound.
 */
const KILLED_RETENTION_MS = 30 * 60 * 1000;
const SOCKET_OPEN = 1;
const SOCKET_CLOSING = 2;
const SOCKET_CLOSED = 3;
const DEFAULT_TERMINAL_COLS = 120;
const DEFAULT_TERMINAL_ROWS = 32;
const MIN_TERMINAL_COLS = 20;
const MIN_TERMINAL_ROWS = 5;

// `<ArrayBuffer>` narrowing matches hono/ws's WSContext.send signature.
type TerminalSocket = {
	send: (data: string | Uint8Array<ArrayBuffer>) => void;
	close: (code?: number, reason?: string) => void;
	readyState: number;
};

// ---------------------------------------------------------------------------
// OSC 133 shell readiness detection (FinalTerm semantic prompt standard).
// Scanner logic lives in @superset/shared/shell-ready-scanner.
// ---------------------------------------------------------------------------

/**
 * How long to wait for the shell-ready marker before unblocking writes.
 * 15 s covers heavy setups like Nix-based devenv via direnv. On timeout
 * buffered writes flush immediately (same behaviour as before this feature).
 */
const SHELL_READY_TIMEOUT_MS = 15_000;

/**
 * Shell readiness lifecycle:
 * - `pending`     — shell initialising; scanner active
 * - `ready`       — OSC 133;A detected; scanner off
 * - `timed_out`   — marker never arrived within timeout; scanner off
 * - `unsupported` — shell has no marker (sh, ksh); scanner never started
 */
type ShellReadyState = "pending" | "ready" | "timed_out" | "unsupported";

interface TerminalSession {
	terminalId: string;
	workspaceId: string;
	pty: DaemonPty;
	/** Unsubscribe from the daemon's output/exit stream when disposed. */
	unsubscribeDaemon: (() => void) | null;
	sockets: Set<TerminalSocket>;
	/**
	 * Buffered PTY output retained for replay on (re)attach. Bytes, not
	 * strings — keeping this byte-aligned with the wire frees us from the
	 * per-chunk UTF-8 decoding that used to mangle TUIs.
	 */
	buffer: Uint8Array[];
	bufferBytes: number;
	/**
	 * Rolling scrollback ring — a separate buffer from `buffer` that is
	 * always populated (regardless of attach state) and never cleared by
	 * `replayBuffer`. Only consulted on kill→resurrect to carry recent
	 * output forward. Capped at MAX_SCROLLBACK_BYTES.
	 */
	scrollbackRing: Uint8Array[];
	scrollbackBytes: number;
	createdAt: number;
	exited: boolean;
	exitCode: number;
	exitSignal: number;
	listed: boolean;
	title: string | null;
	titleScanState: TerminalTitleScanState;

	// Shell readiness (OSC 133)
	shellReadyState: ShellReadyState;
	shellReadyResolve: (() => void) | null;
	shellReadyPromise: Promise<void>;
	shellReadyTimeoutId: ReturnType<typeof setTimeout> | null;
	scanState: ShellReadyScanState;
	initialCommandQueued: boolean;

	/**
	 * Side-channel UTF-8 decoder. portManager.checkOutputForHint takes a
	 * string and does text-pattern matching for "Local: http://…" hints,
	 * so we keep a per-session StringDecoder that buffers partial codepoints
	 * across chunks — separate from the data path, never touching what we
	 * actually broadcast to the renderer.
	 */
	portHintDecoder: StringDecoder;
}

/** PTY lifetime is independent of socket lifetime — sockets detach/reattach freely. */
const sessions = new Map<string, TerminalSession>();

/**
 * Pending `disposeSession` timers for killed-but-retained sessions. Keyed by
 * terminalId. Cleared when the session is resurrected, hard-disposed, or the
 * timer fires.
 */
const killedRetentionTimers = new Map<string, ReturnType<typeof setTimeout>>();

function clearKilledRetention(terminalId: string): void {
	const timer = killedRetentionTimers.get(terminalId);
	if (timer) {
		clearTimeout(timer);
		killedRetentionTimers.delete(terminalId);
	}
}

// When the daemon disconnects, close every WS socket so the renderer's
// existing exponential-backoff reconnect kicks in. On reconnect, host-service
// rebuilds the DaemonClient (next getDaemonClient() call), and the adoption-
// via-list path re-attaches to live sessions on the respawned daemon. Without
// this, sockets stay open and input/resize silently fail because the daemon
// reference is dead.
//
// We also clear the in-memory sessions map so a stale subscription closure
// doesn't keep firing for sessions that no longer match daemon state.
onDaemonDisconnect((err) => {
	const sessionCount = sessions.size;
	if (sessionCount === 0) return;
	console.warn(
		`[terminal] pty-daemon disconnected (${err?.message ?? "no message"}); closing ${sessionCount} terminal WS socket(s) to trigger renderer reconnect`,
	);
	for (const session of sessions.values()) {
		for (const socket of session.sockets) {
			try {
				socket.close(1011, "pty-daemon disconnected");
			} catch {
				// best-effort
			}
		}
		session.sockets.clear();
		if (session.unsubscribeDaemon) {
			try {
				session.unsubscribeDaemon();
			} catch {
				// best-effort
			}
			session.unsubscribeDaemon = null;
		}
	}
	for (const timer of killedRetentionTimers.values()) {
		clearTimeout(timer);
	}
	killedRetentionTimers.clear();
	sessions.clear();
});

/**
 * Test-only escape hatch: simulates a host-service process restart by clearing
 * the in-memory session map without touching the daemon. After calling this,
 * createTerminalSessionInternal() is forced down the adoption-on-EEXIST path
 * for any session id the daemon already owns.
 *
 * NEVER call this from production code paths.
 */
export function __resetSessionsForTesting(): void {
	for (const session of sessions.values()) {
		if (session.unsubscribeDaemon) {
			try {
				session.unsubscribeDaemon();
			} catch {
				// best-effort
			}
		}
	}
	for (const timer of killedRetentionTimers.values()) {
		clearTimeout(timer);
	}
	killedRetentionTimers.clear();
	sessions.clear();
}

function pruneAndCountOpenSockets(session: TerminalSession): number {
	let openSockets = 0;
	for (const socket of session.sockets) {
		if (socket.readyState === SOCKET_OPEN) {
			openSockets += 1;
		} else if (
			socket.readyState === SOCKET_CLOSING ||
			socket.readyState === SOCKET_CLOSED
		) {
			session.sockets.delete(socket);
		}
	}
	return openSockets;
}

export interface TerminalSessionSummary {
	terminalId: string;
	workspaceId: string;
	createdAt: number;
	exited: boolean;
	exitCode: number;
	attached: boolean;
	title: string | null;
}

export function listTerminalSessions(
	options: { workspaceId?: string; includeExited?: boolean } = {},
): TerminalSessionSummary[] {
	const includeExited = options.includeExited ?? true;

	return Array.from(sessions.values())
		.filter((session) => session.listed)
		.filter(
			(session) =>
				options.workspaceId === undefined ||
				session.workspaceId === options.workspaceId,
		)
		.filter((session) => includeExited || !session.exited)
		.map((session) => ({
			terminalId: session.terminalId,
			workspaceId: session.workspaceId,
			createdAt: session.createdAt,
			exited: session.exited,
			exitCode: session.exitCode,
			attached: pruneAndCountOpenSockets(session) > 0,
			title: session.title,
		}));
}

function sendMessage(
	socket: { send: (data: string) => void; readyState: number },
	message: TerminalServerMessage,
) {
	if (socket.readyState !== SOCKET_OPEN) return;
	socket.send(JSON.stringify(message));
}

function broadcastMessage(
	session: TerminalSession,
	message: TerminalServerMessage,
): number {
	let sent = 0;
	for (const socket of session.sockets) {
		if (socket.readyState !== SOCKET_OPEN) {
			if (
				socket.readyState === SOCKET_CLOSING ||
				socket.readyState === SOCKET_CLOSED
			) {
				session.sockets.delete(socket);
			}
			continue;
		}
		sendMessage(socket, message);
		sent += 1;
	}
	return sent;
}

function setSessionTitle(session: TerminalSession, title: string | null) {
	if (session.title === title) return;
	session.title = title;
	broadcastMessage(session, { type: "title", title });
}

function bufferOutput(session: TerminalSession, data: Uint8Array) {
	session.buffer.push(data);
	session.bufferBytes += data.byteLength;

	while (session.bufferBytes > MAX_BUFFER_BYTES && session.buffer.length > 1) {
		const removed = session.buffer.shift();
		if (removed) session.bufferBytes -= removed.byteLength;
	}
}

function appendScrollback(session: TerminalSession, data: Uint8Array) {
	session.scrollbackRing.push(data);
	session.scrollbackBytes += data.byteLength;

	while (
		session.scrollbackBytes > MAX_SCROLLBACK_BYTES &&
		session.scrollbackRing.length > 1
	) {
		const removed = session.scrollbackRing.shift();
		if (removed) session.scrollbackBytes -= removed.byteLength;
	}
}

/**
 * Strip terminal-query escape sequences (CSI/OSC/DCS) that elicit a response
 * from xterm. Replaying these into a fresh xterm during resurrect causes the
 * new shell to receive unsolicited responses on stdin and echo them at its
 * prompt (e.g. `xterm.js(...)` after a DA2 query). Stateful sequences
 * (cursor, color, mode set/reset) are kept — they're what makes scrollback
 * actually look right.
 *
 * Stripped:
 * - CSI ending in `c`        → DA1/DA2/DA3 (Device Attributes)
 * - CSI ending in `n`        → DSR / Cursor Position Report
 * - CSI with `$` final-prefix and `p` final → DECRQM (Request Mode)
 * - OSC containing `?`       → color/palette/etc. queries
 * - DCS starting with `+q`   → XTGETTCAP
 */
function stripTerminalQueries(input: Uint8Array): Uint8Array {
	const chunks: Uint8Array[] = [];
	let total = 0;
	const keep = (start: number, endExclusive: number) => {
		if (endExclusive <= start) return;
		const slice = input.subarray(start, endExclusive);
		chunks.push(slice);
		total += slice.byteLength;
	};

	let i = 0;
	while (i < input.length) {
		if (input[i] !== 0x1b /* ESC */ || i + 1 >= input.length) {
			keep(i, i + 1);
			i++;
			continue;
		}
		const next = input[i + 1];
		if (next === 0x5b /* [ */) {
			// CSI: scan to final byte 0x40-0x7e
			let j = i + 2;
			while (j < input.length) {
				const c = input[j] ?? 0;
				if (c >= 0x40 && c <= 0x7e) break;
				j++;
			}
			if (j >= input.length) {
				keep(i, input.length);
				i = input.length;
				continue;
			}
			const final = input[j];
			const lastParam = j > i + 2 ? (input[j - 1] ?? 0) : 0;
			const isQuery =
				final === 0x63 /* c */ ||
				final === 0x6e /* n */ ||
				(final === 0x70 /* p */ && lastParam === 0x24) /* $ */;
			if (!isQuery) keep(i, j + 1);
			i = j + 1;
			continue;
		}
		if (next === 0x5d /* ] */) {
			// OSC: terminator BEL (0x07) or ST (ESC \)
			let j = i + 2;
			let endLen = 0;
			while (j < input.length) {
				if (input[j] === 0x07) {
					endLen = 1;
					break;
				}
				if (
					input[j] === 0x1b &&
					j + 1 < input.length &&
					input[j + 1] === 0x5c
				) {
					endLen = 2;
					break;
				}
				j++;
			}
			if (j >= input.length) {
				keep(i, input.length);
				i = input.length;
				continue;
			}
			const content = input.subarray(i + 2, j);
			const isQuery = content.indexOf(0x3f /* ? */) !== -1;
			if (!isQuery) keep(i, j + endLen);
			i = j + endLen;
			continue;
		}
		if (next === 0x50 /* P */) {
			// DCS: terminator ST (ESC \)
			let j = i + 2;
			let endLen = 0;
			while (j < input.length) {
				if (
					input[j] === 0x1b &&
					j + 1 < input.length &&
					input[j + 1] === 0x5c
				) {
					endLen = 2;
					break;
				}
				j++;
			}
			if (j >= input.length) {
				keep(i, input.length);
				i = input.length;
				continue;
			}
			const content = input.subarray(i + 2, j);
			const isQuery =
				content.length >= 2 &&
				content[0] === 0x2b /* + */ &&
				content[1] === 0x71 /* q */;
			if (!isQuery) keep(i, j + endLen);
			i = j + endLen;
			continue;
		}
		keep(i, i + 1);
		i++;
	}
	const out = new Uint8Array(total);
	let offset = 0;
	for (const chunk of chunks) {
		out.set(chunk, offset);
		offset += chunk.byteLength;
	}
	return out;
}

export const __testStripTerminalQueries = stripTerminalQueries;

function normalizeTerminalDimension(
	value: number | null | undefined,
	min: number,
	fallback: number,
): number {
	if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
	return Math.max(min, Math.floor(value));
}

// All bytes we send here are ArrayBuffer-backed at runtime (node Buffers,
// scanner outputs); the cast just narrows the type-system's loose default.
function asArrayBufferBytes(bytes: Uint8Array): Uint8Array<ArrayBuffer> {
	return bytes as Uint8Array<ArrayBuffer>;
}

function sendBytes(socket: TerminalSocket, bytes: Uint8Array) {
	if (socket.readyState !== SOCKET_OPEN) return;
	socket.send(asArrayBufferBytes(bytes));
}

function broadcastBytes(session: TerminalSession, bytes: Uint8Array): number {
	let sent = 0;
	const tight = asArrayBufferBytes(bytes);
	for (const socket of session.sockets) {
		if (socket.readyState !== SOCKET_OPEN) {
			if (
				socket.readyState === SOCKET_CLOSING ||
				socket.readyState === SOCKET_CLOSED
			) {
				session.sockets.delete(socket);
			}
			continue;
		}
		socket.send(tight);
		sent += 1;
	}
	return sent;
}

function replayBuffer(session: TerminalSession, socket: TerminalSocket) {
	if (session.buffer.length === 0) return;
	let total = 0;
	for (const b of session.buffer) total += b.byteLength;
	const combined = new Uint8Array(total);
	let offset = 0;
	for (const b of session.buffer) {
		combined.set(b, offset);
		offset += b.byteLength;
	}
	session.buffer.length = 0;
	session.bufferBytes = 0;
	sendBytes(socket, combined);
}

/**
 * Transition out of `pending`. Flushes any partially-matched marker
 * bytes as terminal output (they weren't a real marker). Idempotent.
 */
function resolveShellReady(
	session: TerminalSession,
	state: "ready" | "timed_out",
): void {
	if (session.shellReadyState !== "pending") return;
	session.shellReadyState = state;
	if (session.shellReadyTimeoutId) {
		clearTimeout(session.shellReadyTimeoutId);
		session.shellReadyTimeoutId = null;
	}
	// Flush held marker bytes — they weren't part of a full marker
	if (session.scanState.heldBytes.length > 0) {
		bufferOutput(session, Uint8Array.from(session.scanState.heldBytes));
		session.scanState.heldBytes.length = 0;
	}
	session.scanState.matchPos = 0;
	if (session.shellReadyResolve) {
		session.shellReadyResolve();
		session.shellReadyResolve = null;
	}
}

function queueInitialCommand(
	session: TerminalSession,
	initialCommand: string,
): void {
	if (session.initialCommandQueued || session.exited) return;
	session.initialCommandQueued = true;
	const cmd = initialCommand.endsWith("\n")
		? initialCommand
		: `${initialCommand}\n`;
	session.shellReadyPromise.then(() => {
		if (!session.exited) {
			session.pty.write(cmd);
		}
	});
}

/**
 * Kills the PTY (if live) and marks the DB row disposed. Safe to call even
 * when there's no in-memory session — e.g. for zombie `active` rows left
 * over from a prior crash. Exported so workspaceCleanup can dispose the
 * transient teardown session.
 */
export function disposeSession(terminalId: string, db: HostDb) {
	const session = sessions.get(terminalId);
	clearKilledRetention(terminalId);

	if (session) {
		if (session.shellReadyTimeoutId) {
			clearTimeout(session.shellReadyTimeoutId);
			session.shellReadyTimeoutId = null;
		}
		for (const socket of session.sockets) {
			socket.close(1000, "Session disposed");
		}
		session.sockets.clear();
		if (!session.exited) {
			try {
				session.pty.kill();
			} catch {
				// PTY may already be dead
			}
		}
		// Stop receiving daemon callbacks for this session.
		if (session.unsubscribeDaemon) {
			try {
				session.unsubscribeDaemon();
			} catch {
				// best-effort
			}
			session.unsubscribeDaemon = null;
		}
		sessions.delete(terminalId);
	}

	portManager.unregisterSession(terminalId);

	db.update(terminalSessions)
		.set({ status: "disposed", endedAt: Date.now() })
		.where(eq(terminalSessions.id, terminalId))
		.run();
}

/**
 * Kill the PTY but keep the session entry in memory so it remains visible in
 * the dropdown as "Killed" until either (a) the user resurrects it by
 * selecting it (which `createTerminalSessionInternal` translates into a fresh
 * shell on the same terminalId) or (b) the retention TTL fires and we hard-
 * dispose the entry.
 *
 * Sockets are closed and the daemon subscription is dropped right away — only
 * the metadata (terminalId, workspaceId, title, createdAt, exit code) sticks
 * around for the dropdown to render.
 */
export function markSessionKilled(terminalId: string, db: HostDb): void {
	const session = sessions.get(terminalId);
	if (!session) {
		// No live entry — fall back to a normal dispose so the DB row gets
		// updated and any zombie state is cleaned up.
		disposeSession(terminalId, db);
		return;
	}

	// Idempotent: pane-close fires both a ws "dispose" frame and a trpc
	// killSession in quick succession; the second call lands on an already-
	// exited entry. Don't re-tear-down or reset the TTL — just let the entry
	// sit. Use `purgeKilledSession` for an explicit hard-remove.
	if (session.exited) return;

	if (session.shellReadyTimeoutId) {
		clearTimeout(session.shellReadyTimeoutId);
		session.shellReadyTimeoutId = null;
	}
	for (const socket of session.sockets) {
		socket.close(1000, "Session killed");
	}
	session.sockets.clear();
	if (!session.exited) {
		try {
			session.pty.kill();
		} catch {
			// PTY may already be dead
		}
	}
	if (session.unsubscribeDaemon) {
		try {
			session.unsubscribeDaemon();
		} catch {
			// best-effort
		}
		session.unsubscribeDaemon = null;
	}
	// Mark exited synchronously — the daemon's onExit callback may not fire
	// after we drop the subscription, so the dropdown would otherwise show
	// the killed session as "Attached" until the natural exit raced through.
	session.exited = true;
	if (session.exitCode === 0 && session.exitSignal === 0) {
		// Synthesize a SIGTERM signal so listeners can distinguish kill from
		// clean exit. Real signal arrives later via daemon onExit if it fires.
		session.exitSignal = 15;
	}

	portManager.unregisterSession(terminalId);

	db.update(terminalSessions)
		.set({ status: "exited", endedAt: Date.now() })
		.where(eq(terminalSessions.id, terminalId))
		.run();

	clearKilledRetention(terminalId);
	const timer = setTimeout(() => {
		killedRetentionTimers.delete(terminalId);
		disposeSession(terminalId, db);
	}, KILLED_RETENTION_MS);
	// Don't keep the host-service process alive just to fire this cleanup.
	if (typeof timer.unref === "function") timer.unref();
	killedRetentionTimers.set(terminalId, timer);
}

/**
 * Dispose every active session belonging to the given workspace.
 * Returns counts so callers (e.g. workspaceCleanup.destroy) can surface warnings.
 */
export function disposeSessionsByWorkspaceId(
	workspaceId: string,
	db: HostDb,
): { terminated: number; failed: number } {
	const rows = db
		.select({ id: terminalSessions.id })
		.from(terminalSessions)
		.where(
			and(
				eq(terminalSessions.originWorkspaceId, workspaceId),
				ne(terminalSessions.status, "disposed"),
			),
		)
		.all();

	let terminated = 0;
	let failed = 0;
	for (const row of rows) {
		try {
			disposeSession(row.id, db);
			terminated += 1;
		} catch {
			failed += 1;
		}
	}
	return { terminated, failed };
}

interface CreateTerminalSessionOptions {
	terminalId: string;
	workspaceId: string;
	themeType?: "dark" | "light";
	db: HostDb;
	eventBus?: EventBus;
	/** Command to run after the shell is ready. Queued behind shellReadyPromise. */
	initialCommand?: string;
	/** Hidden sessions are process-internal and should not appear in user pickers. */
	listed?: boolean;
	cols?: number;
	rows?: number;
	/** Only recover an already-live daemon session; never spawn a new PTY. */
	adoptOnly?: boolean;
	/**
	 * Replay the daemon's ring buffer on subscribe. Default true. Pass false
	 * when the renderer's xterm already has the scrollback — replaying then
	 * doubles the visible output. Tradeoff: bytes the PTY produced during
	 * the WS-down window are dropped (sub-second on a daemon swap).
	 */
	replayOnAdoption?: boolean;
}

export async function createTerminalSessionInternal({
	terminalId,
	workspaceId,
	themeType,
	db,
	eventBus,
	initialCommand,
	listed = true,
	cols: requestedCols,
	rows: requestedRows,
	adoptOnly = false,
	replayOnAdoption = true,
}: CreateTerminalSessionOptions): Promise<TerminalSession | { error: string }> {
	const existing = sessions.get(terminalId);
	let resurrectedTitle: string | null = null;
	let resurrectedScrollback: Uint8Array | null = null;
	if (existing) {
		if (existing.exited) {
			// Resurrect: keep the title (dropdown label) and the killed shell's
			// scrollback. The scrollback is run through stripTerminalQueries to
			// drop CSI/OSC/DCS sequences that would elicit a response from the
			// new xterm — those are why the previous shell's queries used to
			// echo at the new prompt. Stateful sequences (cursor, color, alt
			// screen mode) pass through so the visible output looks right.
			resurrectedTitle = existing.title;
			if (existing.scrollbackBytes > 0) {
				const total = existing.scrollbackBytes;
				const combined = new Uint8Array(total);
				let offset = 0;
				for (const chunk of existing.scrollbackRing) {
					combined.set(chunk, offset);
					offset += chunk.byteLength;
				}
				resurrectedScrollback = stripTerminalQueries(combined);
			}
			clearKilledRetention(terminalId);
			sessions.delete(terminalId);
		} else {
			if (listed) existing.listed = true;
			if (initialCommand) queueInitialCommand(existing, initialCommand);
			return existing;
		}
	}

	const workspace = db.query.workspaces
		.findFirst({ where: eq(workspaces.id, workspaceId) })
		.sync();

	if (!workspace || !existsSync(workspace.worktreePath)) {
		return { error: "Workspace worktree not found" };
	}

	// Derive root path from the workspace's project
	let rootPath = "";
	const project = db.query.projects
		.findFirst({ where: eq(projects.id, workspace.projectId) })
		.sync();
	if (project?.repoPath) {
		rootPath = project.repoPath;
	}

	const cwd = workspace.worktreePath;
	const cols = normalizeTerminalDimension(
		requestedCols,
		MIN_TERMINAL_COLS,
		DEFAULT_TERMINAL_COLS,
	);
	const rows = normalizeTerminalDimension(
		requestedRows,
		MIN_TERMINAL_ROWS,
		DEFAULT_TERMINAL_ROWS,
	);

	// Use the preserved shell snapshot — never live process.env
	const baseEnv = getTerminalBaseEnv();
	const supersetHomeDir = process.env.SUPERSET_HOME_DIR || "";
	const shell = resolveLaunchShell(baseEnv);
	const shellArgs = getShellLaunchArgs({ shell, supersetHomeDir });
	const ptyEnv = buildV2TerminalEnv({
		baseEnv,
		shell,
		supersetHomeDir,
		themeType,
		cwd,
		terminalId,
		workspaceId,
		workspacePath: workspace.worktreePath,
		rootPath,
		hostServiceVersion: process.env.HOST_SERVICE_VERSION || "unknown",
		supersetEnv:
			process.env.NODE_ENV === "development" ? "development" : "production",
		agentHookPort: process.env.SUPERSET_AGENT_HOOK_PORT || "",
		agentHookVersion: process.env.SUPERSET_AGENT_HOOK_VERSION || "",
		hostAgentHookUrl: getHostAgentHookUrl(),
	});

	let daemon: DaemonClient;
	let openResult: { pid: number };
	let isAdopted = false;
	try {
		daemon = await getDaemonClient();
		if (adoptOnly) {
			const found = (await daemon.list()).find(
				(s) => s.id === terminalId && s.alive,
			);
			if (!found) {
				return {
					error: `Terminal session "${terminalId}" is not active; create it before connecting.`,
				};
			}
			openResult = { pid: found.pid };
			isAdopted = true;
			console.log(
				`[terminal] adopted existing daemon session ${terminalId} pid=${found.pid}`,
			);
		} else {
			try {
				openResult = await daemon.open(terminalId, {
					shell,
					argv: shellArgs,
					cwd,
					cols,
					rows,
					env: ptyEnv,
				});
			} catch (err) {
				// After host-service restart the daemon may already own this
				// session. Adopt it instead of looping forever on "session already
				// exists". The daemon kept the buffer + the live shell; we just
				// need to stitch up a TerminalSession record on this side and
				// subscribe-with-replay below.
				const msg = err instanceof Error ? err.message : String(err);
				if (msg.includes("session already exists")) {
					const list = await daemon.list();
					const found = list.find((s) => s.id === terminalId && s.alive);
					if (!found) throw err;
					openResult = { pid: found.pid };
					isAdopted = true;
					console.log(
						`[terminal] adopted existing daemon session ${terminalId} pid=${found.pid}`,
					);
				} else {
					throw err;
				}
			}
		}
	} catch (error) {
		return {
			error:
				error instanceof Error ? error.message : "Failed to start terminal",
		};
	}
	const pty: DaemonPty = makeDaemonPty(daemon, terminalId, openResult.pid);

	const createdAt = Date.now();

	db.insert(terminalSessions)
		.values({
			id: terminalId,
			originWorkspaceId: workspaceId,
			status: "active",
			createdAt,
		})
		.onConflictDoUpdate({
			target: terminalSessions.id,
			set: { status: "active", createdAt, endedAt: null },
		})
		.run();

	// Determine shell readiness support. Adopted sessions are already past
	// shell startup, so treat them as immediately ready — the OSC 133;A
	// marker has already flown by and we don't want to gate writes on it.
	const shellName = shell.split("/").pop() || shell;
	const shellSupportsReady =
		!isAdopted && SHELLS_WITH_READY_MARKER.has(shellName);

	let shellReadyResolve: (() => void) | null = null;
	const shellReadyPromise = shellSupportsReady
		? new Promise<void>((resolve) => {
				shellReadyResolve = resolve;
			})
		: Promise.resolve();

	const session: TerminalSession = {
		terminalId,
		workspaceId,
		pty,
		unsubscribeDaemon: null,
		sockets: new Set(),
		buffer: [],
		bufferBytes: 0,
		scrollbackRing: [],
		scrollbackBytes: 0,
		createdAt,
		exited: false,
		exitCode: 0,
		exitSignal: 0,
		listed,
		title: resurrectedTitle,
		titleScanState: createTerminalTitleScanState(),
		shellReadyState: shellSupportsReady
			? "pending"
			: isAdopted
				? "ready"
				: "unsupported",
		shellReadyResolve,
		shellReadyPromise,
		shellReadyTimeoutId: null,
		scanState: createScanState(),
		// Adopted sessions have already run their initialCommand in the prior
		// host-service lifetime — flag it as queued so we don't double-fire it.
		initialCommandQueued: isAdopted,
		portHintDecoder: new StringDecoder("utf8"),
	};
	sessions.set(terminalId, session);
	portManager.upsertSession(terminalId, workspaceId, pty.pid);

	// Front-load the carried-over scrollback into the replay buffer so the
	// renderer sees prior output above the fresh shell prompt on first attach.
	// Bypass bufferOutput's 64KB cap since the scrollback ring is sized to
	// its own (larger) ceiling — we want the user to see real history, not a
	// one-screen sliver. New shell startup output appended after will still
	// trigger trimming via bufferOutput once the cap is exceeded.
	if (resurrectedScrollback && resurrectedScrollback.byteLength > 0) {
		session.buffer.push(resurrectedScrollback);
		session.bufferBytes += resurrectedScrollback.byteLength;
	}

	// If the marker never arrives (broken wrapper, unsupported config),
	// the timeout unblocks so the session degrades gracefully.
	if (session.shellReadyState === "pending") {
		session.shellReadyTimeoutId = setTimeout(() => {
			resolveShellReady(session, "timed_out");
		}, SHELL_READY_TIMEOUT_MS);
	}

	session.unsubscribeDaemon = daemon.subscribe(
		terminalId,
		{ replay: replayOnAdoption },
		{
			onOutput(chunk) {
				// Bytes flow daemon → host → xterm without UTF-8 decoding;
				// per-chunk `.toString("utf8")` here would mangle codepoints
				// straddling chunk boundaries. (See no-encoding-hops.test.ts.)
				const titleUpdates = scanForTerminalTitle(
					session.titleScanState,
					chunk,
				);
				for (const title of titleUpdates.updates) {
					setSessionTitle(session, title);
				}

				let bytes: Uint8Array = chunk;
				if (session.shellReadyState === "pending") {
					const result = scanForShellReady(session.scanState, chunk);
					bytes = result.output;
					if (result.matched) {
						resolveShellReady(session, "ready");
					}
				}
				if (bytes.byteLength === 0) return;

				// portManager.checkOutputForHint runs URL/port regexes on
				// strings; the per-session StringDecoder buffers partial
				// codepoints across chunks. This is a side branch — the
				// transport above stays on bytes.
				const hintText = session.portHintDecoder.write(
					bytes instanceof Buffer
						? bytes
						: Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength),
				);
				if (hintText.length > 0) portManager.checkOutputForHint(hintText);

				// Always feed the scrollback ring so kill→resurrect has
				// something to carry over even when the session was actively
				// attached at kill time. This is independent of the replay
				// buffer below; replay still operates on detach-window output.
				appendScrollback(session, bytes);
				if (broadcastBytes(session, bytes) === 0) {
					bufferOutput(session, bytes);
				}
			},
			onExit({ code, signal }) {
				session.exited = true;
				session.exitCode = code ?? 0;
				session.exitSignal = signal ?? 0;

				portManager.unregisterSession(terminalId);

				db.update(terminalSessions)
					.set({ status: "exited", endedAt: Date.now() })
					.where(eq(terminalSessions.id, terminalId))
					.run();

				broadcastMessage(session, {
					type: "exit",
					exitCode: session.exitCode,
					signal: session.exitSignal,
				});

				eventBus?.broadcastTerminalLifecycle({
					workspaceId,
					terminalId,
					eventType: "exit",
					exitCode: session.exitCode,
					signal: session.exitSignal,
					occurredAt: Date.now(),
				});

				// Keep the entry around long enough for the user to spot it as
				// "Killed" in the dropdown and resurrect it. After the TTL we
				// hard-dispose so the map doesn't grow without bound.
				clearKilledRetention(terminalId);
				const timer = setTimeout(() => {
					killedRetentionTimers.delete(terminalId);
					disposeSession(terminalId, db);
				}, KILLED_RETENTION_MS);
				if (typeof timer.unref === "function") timer.unref();
				killedRetentionTimers.set(terminalId, timer);
			},
		},
	);

	if (initialCommand) {
		queueInitialCommand(session, initialCommand);
	}

	return session;
}

export function registerWorkspaceTerminalRoute({
	app,
	db,
	eventBus,
	upgradeWebSocket,
}: RegisterWorkspaceTerminalRouteOptions) {
	app.post("/terminal/sessions", async (c) => {
		const body = await c.req.json<{
			terminalId: string;
			workspaceId: string;
			themeType?: string;
			initialCommand?: string;
			cols?: number;
			rows?: number;
		}>();

		if (!body.terminalId || !body.workspaceId) {
			return c.json({ error: "Missing terminalId or workspaceId" }, 400);
		}

		const result = await createTerminalSessionInternal({
			terminalId: body.terminalId,
			workspaceId: body.workspaceId,
			themeType: parseThemeType(body.themeType),
			db,
			eventBus,
			initialCommand: body.initialCommand,
			cols: body.cols,
			rows: body.rows,
		});

		if ("error" in result) {
			return c.json({ error: result.error }, 500);
		}

		return c.json({ terminalId: result.terminalId, status: "active" });
	});

	// REST dispose — does not require an open WebSocket
	app.delete("/terminal/sessions/:terminalId", (c) => {
		const terminalId = c.req.param("terminalId");
		if (!terminalId) {
			return c.json({ error: "Missing terminalId" }, 400);
		}

		const session = sessions.get(terminalId);
		if (!session) {
			return c.json({ error: "Session not found" }, 404);
		}

		disposeSession(terminalId, db);
		return c.json({ terminalId, status: "disposed" });
	});

	// REST list — enumerate live terminal sessions
	app.get("/terminal/sessions", (c) => {
		const workspaceId = c.req.query("workspaceId") || undefined;
		return c.json({
			sessions: listTerminalSessions({ workspaceId, includeExited: true }),
		});
	});

	app.get(
		"/terminal/:terminalId",
		upgradeWebSocket((c) => {
			const terminalId = c.req.param("terminalId") ?? "";
			const attachSocketToSession = (
				session: TerminalSession,
				ws: TerminalSocket,
			): boolean => {
				if (session.sockets.has(ws)) return false;
				session.sockets.add(ws);
				sendMessage(ws, { type: "attached", terminalId });

				db.update(terminalSessions)
					.set({ lastAttachedAt: Date.now() })
					.where(eq(terminalSessions.id, terminalId))
					.run();

				sendMessage(ws, { type: "title", title: session.title });
				replayBuffer(session, ws);
				if (session.exited) {
					sendMessage(ws, {
						type: "exit",
						exitCode: session.exitCode,
						signal: session.exitSignal,
					});
				}
				return true;
			};
			const resolveSessionForAttach = async (): Promise<
				TerminalSession | { error: string }
			> => {
				const existing = sessions.get(terminalId);
				if (existing && !existing.exited) return existing;
				if (existing?.exited) {
					// Killed entry retained for the dropdown — attaching to one
					// means the user picked it to resurrect. Spawn a fresh shell
					// on the same terminalId; createTerminalSessionInternal carries
					// over the buffer + title from the killed entry.
					console.log(`[terminal] resurrecting killed session ${terminalId}`);
					return createTerminalSessionInternal({
						terminalId,
						workspaceId: existing.workspaceId,
						themeType: parseThemeType(c.req.query("themeType")),
						db,
						eventBus,
						replayOnAdoption: c.req.query("replay") !== "0",
					});
				}

				const record = db.query.terminalSessions
					.findFirst({ where: eq(terminalSessions.id, terminalId) })
					.sync();
				if (!record) {
					return {
						error: `Terminal session "${terminalId}" not found; create it before connecting.`,
					};
				}
				if (record.status === "disposed") {
					return { error: `Terminal session "${terminalId}" is disposed.` };
				}
				if (record.status === "exited") {
					return { error: `Terminal session "${terminalId}" has exited.` };
				}
				if (!record.originWorkspaceId) {
					return {
						error: `Terminal session "${terminalId}" is missing a workspace.`,
					};
				}

				const themeType = parseThemeType(c.req.query("themeType"));

				// Prefer adoption: if the daemon still owns the PTY across a
				// host-service restart, we keep the live shell + ring buffer.
				const adopted = await createTerminalSessionInternal({
					terminalId,
					workspaceId: record.originWorkspaceId,
					themeType,
					db,
					eventBus,
					adoptOnly: true,
					// Renderer passes `?replay=0` on reconnect; see replayOnAdoption.
					replayOnAdoption: c.req.query("replay") !== "0",
				});
				if (!("error" in adopted)) return adopted;

				// Active row but daemon no longer owns the PTY (laptop sleep,
				// daemon restart, machine reboot). Respawn rather than dead-end
				// the pane — the renderer's xterm scrollback stays painted above.
				console.log(`[terminal] respawning lost session ${terminalId}`);
				return createTerminalSessionInternal({
					terminalId,
					workspaceId: record.originWorkspaceId,
					themeType,
					db,
					eventBus,
				});
			};

			return {
				onOpen: (_event, ws) => {
					if (!terminalId) {
						ws.close(1011, "Missing terminalId");
						return;
					}

					void (async () => {
						const session = await resolveSessionForAttach();
						if ("error" in session) {
							sendMessage(ws, { type: "error", message: session.error });
							ws.close(1011, session.error);
							return;
						}
						if (ws.readyState !== SOCKET_OPEN) return;
						attachSocketToSession(session, ws);
					})().catch((error) => {
						console.error("[terminal] unexpected error during attach", error);
						if (ws.readyState !== SOCKET_OPEN) return;
						sendMessage(ws, {
							type: "error",
							message: "Internal terminal attach error",
						});
						ws.close(1011, "Internal terminal attach error");
					});
				},

				onMessage: (event, ws) => {
					let message: TerminalClientMessage;
					try {
						message = JSON.parse(String(event.data)) as TerminalClientMessage;
					} catch {
						sendMessage(ws, {
							type: "error",
							message: "Invalid terminal message payload",
						});
						return;
					}

					const session = sessions.get(terminalId ?? "");
					if (!session || !session.sockets.has(ws)) return;

					if (message.type === "dispose") {
						// Mark-killed (not hard-dispose) so the entry survives in the
						// dropdown as "Killed" — the trpc killSession call from the
						// pane-close path lands here too and is idempotent.
						markSessionKilled(terminalId ?? "", db);
						return;
					}

					if (session.exited) return;

					if (message.type === "input") {
						session.pty.write(message.data);
						return;
					}

					if (message.type === "resize") {
						const cols = normalizeTerminalDimension(
							message.cols,
							MIN_TERMINAL_COLS,
							DEFAULT_TERMINAL_COLS,
						);
						const rows = normalizeTerminalDimension(
							message.rows,
							MIN_TERMINAL_ROWS,
							DEFAULT_TERMINAL_ROWS,
						);
						session.pty.resize(cols, rows);
					}
				},

				onClose: (_event, ws) => {
					const session = sessions.get(terminalId ?? "");
					session?.sockets.delete(ws);
				},

				onError: (_event, ws) => {
					const session = sessions.get(terminalId ?? "");
					session?.sockets.delete(ws);
				},
			};
		}),
	);
}
