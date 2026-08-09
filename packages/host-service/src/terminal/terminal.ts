import { randomBytes } from "node:crypto";
import { existsSync, writeFileSync } from "node:fs";
import { readdir, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, isAbsolute, join } from "node:path";
import { StringDecoder } from "node:string_decoder";
import type { NodeWebSocket } from "@hono/node-ws";
import { hasRunningForegroundProcess } from "@superset/pty-daemon/process-tree";
import {
	createScanState,
	type ShellReadyScanState,
	scanForShellReady,
} from "@superset/shared/shell-ready-scanner";
import {
	createTerminalTitleScanState,
	scanForTerminalTitle,
	type TerminalTitleScanState,
} from "@superset/shared/terminal-title-scanner";
import { and, eq, inArray, isNull, ne } from "drizzle-orm";
import type { Hono } from "hono";
import { getSupervisor } from "../daemon/index.ts";
import { isProcessAlive, readPtyDaemonManifest } from "../daemon/manifest.ts";
import type { HostDb } from "../db/index.ts";
import { projects, terminalSessions, workspaces } from "../db/schema.ts";
import type { EventBus } from "../events/index.ts";
import { portManager } from "../ports/port-manager.ts";
import { sweepAgentBindingsAfterDaemonLoss } from "../terminal-agents/daemon-loss-sweep.ts";
import { markTerminalAgentBindingEnded } from "../terminal-agents/persistence.ts";
import {
	DaemonClient,
	type Signal as DaemonSignal,
} from "./DaemonClient/index.ts";
import {
	getDaemonClient,
	onDaemonDisconnect,
} from "./daemon-client-singleton.ts";
import {
	buildV2TerminalEnv,
	getShellLaunchArgs,
	getTerminalBaseEnv,
	resolveLaunchShell,
	shellLaunchExpectsReadyMarker,
	waitForTerminalBaseEnv,
} from "./env.ts";
import { listTerminalResourceSessions } from "./resource-sessions.ts";
import {
	createModeTracker,
	type ModeTracker,
	type TerminalSnapshot,
} from "./terminal-mode-tracker.ts";

/**
 * Thin adapter exposing approximately the IPty surface that the rest of
 * this file (and teardown.ts) was built against, so most of the call
 * sites stay unchanged after the daemon extraction. The PTY itself lives
 * in pty-daemon; this adapter forwards to it over the daemon socket.
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
	kill(signal?: NodeJS.Signals): Promise<void>;
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
			return daemon.close(sessionId, toDaemonSignal(signal));
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
	// The client's current keyboard-focus state, sent on every attach. A
	// reattaching client may hold focus the program last heard it lost (or
	// vice versa) — a fresh xterm can't self-report because focus-reporting
	// mode only reaches it via the preamble after its focus already settled.
	// The host forwards it as \x1b[I / \x1b[O only when the program actually
	// enabled focus reporting (mode 1004), which the tracker knows.
	| { type: "focus"; focused: boolean }
	| { type: "dispose" };

// PTY output bytes travel as binary WebSocket frames — the renderer pipes
// the ArrayBuffer straight into xterm.write(Uint8Array) without any UTF-8
// decoding. Control messages stay JSON. Replay (the buffered prefix sent
// on attach) is a binary frame too; the renderer doesn't distinguish it
// from live data.
type TerminalServerMessage =
	| { type: "attached"; terminalId: string }
	// `code: "session-gone"` marks the session as permanently destroyed (not
	// found / disposed / exited) so the renderer can drop persisted scrollback;
	// plain errors leave it unset and the renderer keeps its snapshot.
	| { type: "error"; message: string; code?: "session-gone" }
	| { type: "exit"; exitCode: number; signal: number }
	| { type: "title"; title: string | null }
	// Sequence anchor for seq-aware clients (`?seq=` on the attach URL). Sent
	// once per attach, AFTER any host-synthesized bytes (mode preamble,
	// restored notice) and BEFORE catch-up/live PTY bytes. The client sets its
	// byte counter to `seq` and counts every subsequent binary frame, so both
	// sides agree on stream position without per-frame headers.
	// - `exact`:    client's anchor was inside the catch-up ring — the binary
	//               bytes that follow are exactly the missed suffix.
	// - `tail`:     client attached empty — whatever ring content exists
	//               follows as a best-effort scrollback restore.
	// - `reanchor`: the client's position is unknown or unrecoverable (epoch
	//               mismatch after a host restart, gap beyond the ring). No
	//               content bytes are sent — the client's screen is presumed
	//               better than anything we could synthesize (see #6290) — and
	//               a repaint nudge asks the running program to redraw itself.
	| { type: "synced"; epoch: string; seq: number; mode: SyncedMode };

type SyncedMode = "exact" | "tail" | "reanchor";

/**
 * Parsed `?seq=` attach param.
 * - absent  → legacy client: byte-identical pre-seq behavior (preamble + FIFO).
 * - "new"   → seq-aware client with a virgin xterm: wants the ring tail.
 * - "none"  → seq-aware client with restored content but no trustworthy
 *             anchor (persisted by an older build, multi-instance seed):
 *             reanchor without dumping bytes into its existing screen.
 * - "<epoch>:<n>" → anchored client: exact catch-up when possible.
 */
type SeqAttachRequest =
	| { kind: "legacy" }
	| { kind: "new" }
	| { kind: "none" }
	| { kind: "anchor"; epoch: string; seq: number };

function parseSeqAttachParam(
	value: string | null | undefined,
): SeqAttachRequest {
	// Absent means a pre-seq client; an explicitly empty value is a malformed
	// seq-aware dial and falls through to the safe reanchor below.
	if (value === null || value === undefined) return { kind: "legacy" };
	if (value === "new") return { kind: "new" };
	if (value === "none") return { kind: "none" };
	const sep = value.indexOf(":");
	if (sep > 0) {
		const epoch = value.slice(0, sep);
		const seq = Number(value.slice(sep + 1));
		if (epoch && Number.isSafeInteger(seq) && seq >= 0) {
			return { kind: "anchor", epoch, seq };
		}
	}
	// Malformed → safest degraded mode: reanchor, never dump bytes.
	return { kind: "none" };
}

const MAX_BUFFER_BYTES = 64 * 1024;
/**
 * Catch-up ring cap per session. Sized so that a renderer that missed output
 * (laptop sleep, back-pressure drop, parked-runtime eviction) can almost
 * always be caught up with the exact missed bytes instead of a lossy
 * reanchor — the deterministic ghost repro from #6279 was ~105 KB of missed
 * TUI repaints; 2 MiB gives ~20x margin while staying far under the 8 MiB
 * per-socket send cap. Memory is bounded per session and only holds bytes
 * actually emitted.
 */
const CATCHUP_RING_CAP_BYTES = 2 * 1024 * 1024;
/**
 * How long after a reanchor attach to wait for the renderer's own resize
 * (which fires a natural SIGWINCH when dims changed) before forcing the
 * repaint nudge anyway.
 */
const REPAINT_NUDGE_FALLBACK_MS = 2_000;
/** Gap between the nudge's shrink and restore resizes. */
const REPAINT_NUDGE_RESTORE_MS = 60;
// Dim separator delivered ahead of a respawned shell's output so users can
// tell restored scrollback from the fresh session (cf. VS Code's "History
// restored" line).
const SESSION_RESTORED_NOTICE = new TextEncoder().encode(
	"\r\n\x1b[90m─── Session Contents Restored ───\x1b[0m\r\n\r\n",
);
// Cap on a single renderer socket's unflushed WebSocket send buffer. With no
// ACK flow control, a renderer that stops draining (slow paint, pinned main
// thread, dead tab) would let this buffer grow without bound → host OOM (the
// risk #4868 was about). Once a socket blows past this, we drop it; the
// renderer auto-reconnects and replays the bounded tail buffer. Crucially the
// PTY is never paused, so a stalled renderer can't wedge the shell. Matches the
// daemon's own 8 MB outbound socket cap.
const WS_SEND_BUFFER_CAP_BYTES = 8 * 1024 * 1024;
const SOCKET_OPEN = 1;
const SOCKET_CLOSING = 2;
const SOCKET_CLOSED = 3;
const DEFAULT_TERMINAL_COLS = 120;
const DEFAULT_TERMINAL_ROWS = 32;
const MIN_TERMINAL_COLS = 20;
const MIN_TERMINAL_ROWS = 5;

// `<ArrayBuffer>` narrowing matches hono/ws's WSContext.send signature.
// `raw` is the underlying `ws` WebSocket (present for node-ws); we read
// `bufferedAmount` off it to bound a slow renderer's send queue.
type TerminalSocket = {
	send: (data: string | Uint8Array<ArrayBuffer>) => void;
	close: (code?: number, reason?: string) => void;
	readyState: number;
	raw?: { readonly bufferedAmount?: number };
};

// ---------------------------------------------------------------------------
// OSC 133 shell readiness detection (FinalTerm semantic prompt standard).
// Scanner logic lives in @superset/shared/shell-ready-scanner.
// ---------------------------------------------------------------------------

/**
 * Upper bound on the OSC 133;A wait before queued automation runs anyway.
 * Wrapper files on disk don't guarantee the marker reaches the scanner —
 * a user rc can exec another process or re-point ZDOTDIR so our .zlogin
 * never runs — and an unbounded wait silently drops preset/agent commands
 * (#4963, regressed by #5774). 15s covers heavy setups like Nix devenv
 * via direnv; same budget as the v1 stack.
 */
const SHELL_READY_TIMEOUT_MS = 15_000;

/**
 * Gap between writing the initialCommand text and the Enter (`\r`) that runs
 * it. The shell-ready marker fires from precmd, before the line editor reads
 * input — plugin init in that window can flush the PTY input queue, eating a
 * newline bundled with the command while the text itself survives in the edit
 * buffer (typed-but-never-run). A separated, delayed Enter lands after that
 * init storm.
 */
const INITIAL_COMMAND_ENTER_DELAY_MS = 500;

/**
 * Gap between a follow-up send's text and the Enter that submits it. TUI
 * agents treat bytes arriving together as one paste burst, so an Enter
 * bundled with the text can be swallowed into the draft instead of
 * submitting it when the session is busy or slow (#6243). The delay puts
 * the Enter in its own read, where it can only be a keypress.
 */
const FOLLOW_UP_ENTER_DELAY_MS = 500;

/**
 * Byte ceiling for typing an initialCommand directly into the PTY. The
 * shell-ready marker fires from precmd, before the line editor switches the
 * TTY to raw mode; input written in that gap queues under the kernel's
 * canonical-mode line discipline, which silently drops every byte past
 * MAX_CANON (1024 on macOS). Long agent launches lost their closing quote
 * and wedged the shell at `quote>` (#5092). Commands over this limit are
 * staged as a temp script and only a short source line is typed; 512 leaves
 * margin for platforms with tighter line-discipline limits.
 */
const MAX_TYPED_INITIAL_COMMAND_BYTES = 512;

/**
 * Shell readiness lifecycle:
 * - `pending`     — shell initialising; scanner active
 * - `ready`       — OSC 133;A detected; scanner off
 * - `timed_out`   — marker never arrived in time; queued automation runs anyway
 * - `unsupported` — launch config has no marker; scanner never started
 * - `cancelled`   — session ended before readiness; queued automation cancelled
 */
type ShellReadyState =
	| "pending"
	| "ready"
	| "timed_out"
	| "unsupported"
	| "cancelled";

interface TerminalSession {
	terminalId: string;
	workspaceId: string;
	/** Handle for db writes from module-scope handlers (daemon disconnect). */
	db: HostDb;
	pty: DaemonPty;
	cols: number;
	rows: number;
	/** Unsubscribe from the daemon's output/exit stream when disposed. */
	unsubscribeDaemon: (() => void) | null;
	sockets: Set<TerminalSocket>;
	/**
	 * Legacy replay FIFO for clients that attach without `?seq=` (pre-seq
	 * renderers, raw WS consumers): fills only while zero sockets are
	 * attached, drained by replayBuffer(). Seq-aware clients are served from
	 * the `retained` catch-up ring instead. Delete once the renderer floor
	 * speaks seq. Bytes, not strings — byte-aligned with the wire so
	 * per-chunk UTF-8 decoding can't mangle TUIs.
	 */
	buffer: Uint8Array[];
	bufferBytes: number;
	/**
	 * Deliver SESSION_RESTORED_NOTICE ahead of the next replay. Kept out of
	 * the FIFO so MAX_BUFFER_BYTES eviction can't drop it before a client
	 * attaches. Cleared on first replay.
	 */
	restoredNoticePending: boolean;
	createdAt: number;
	exited: boolean;
	exitCode: number;
	exitSignal: number;
	listed: boolean;
	title: string | null;
	titleScanState: TerminalTitleScanState;
	/**
	 * Bus for lifecycle broadcasts. Kept on the session so dispose (which
	 * unsubscribes daemon callbacks before the pty dies, muting onExit) can
	 * still announce the exit to renderers.
	 */
	eventBus: EventBus | undefined;

	// Shell readiness (OSC 133)
	shellReadyState: ShellReadyState;
	shellReadyResolve: (() => void) | null;
	shellReadyPromise: Promise<void>;
	shellReadyTimeoutId: ReturnType<typeof setTimeout> | null;
	scanState: ShellReadyScanState;
	initialCommandQueued: boolean;
	/**
	 * Basename of the launch shell. Picks the source keyword when a long
	 * initialCommand is staged as a script (fish 4 removed `.`; sh/ksh
	 * have no `source`).
	 */
	launchShellName: string;

	/**
	 * Side-channel UTF-8 decoder. portManager.checkOutputForHint takes a
	 * string and does text-pattern matching for "Local: http://…" hints,
	 * so we keep a per-session StringDecoder that buffers partial codepoints
	 * across chunks — separate from the data path, never touching what we
	 * actually broadcast to the renderer.
	 */
	portHintDecoder: StringDecoder;

	/**
	 * Mirrors PTY output through a headless xterm so a reattaching renderer
	 * can be resynced via a mode preamble — covers kitty keyboard, bracketed
	 * paste, focus, mouse, etc. that the FIFO can't restore on its own.
	 */
	modeTracker: ModeTracker;

	/**
	 * Stream identity for seq-aware clients. Fresh per TerminalSession object
	 * (create, adopt, respawn) — a client anchored to a different epoch has an
	 * unknowable position (the byte counter restarted) and gets a reanchor.
	 */
	epoch: string;
	/** Absolute count of PTY output bytes emitted since this session object was created. */
	outputSeq: number;
	/**
	 * Catch-up ring: the retained tail of the output stream, so a reattaching
	 * seq-aware client receives exactly the bytes it missed (exactly-once
	 * delivery, Eternal-Terminal style) instead of a lossy tail dump. Unlike
	 * the legacy FIFO (`buffer`), this retains regardless of attached sockets.
	 */
	retained: Uint8Array[];
	retainedBytes: number;
	/** Absolute seq of the first byte still in `retained`. */
	retainedStartSeq: number;
	/**
	 * Armed on a reanchor attach: the client may have missed output we can't
	 * re-deliver, so once its resize arrives (or the fallback timer fires),
	 * force a SIGWINCH repaint so the running program redraws itself — the
	 * only party that always knows the full screen truth.
	 */
	pendingRepaintNudge: ReturnType<typeof setTimeout> | null;
	/** Bumped on every client resize; guards the nudge's delayed restore. */
	resizeGeneration: number;
	/**
	 * Sockets whose client currently holds keyboard focus. The PTY receives
	 * the AGGREGATE (any focused socket) — so an unfocused duplicate pane
	 * attaching can't tell the program the focused pane lost focus (tmux's
	 * client-focus ownership model).
	 */
	focusedSockets: Set<TerminalSocket>;

	/**
	 * Tail of the in-flight follow-up send (writeFramedInputToSession).
	 * Serializes text + delayed-Enter sequences so concurrent sends can't
	 * interleave inside another send's Enter window.
	 */
	followUpWriteChain?: Promise<void>;
}

/** PTY lifetime is independent of socket lifetime — sockets detach/reattach freely. */
const sessions = new Map<string, TerminalSession>();

// When the daemon disconnects, close every WS socket so the renderer's
// existing exponential-backoff reconnect kicks in. On reconnect, host-service
// rebuilds the DaemonClient (next getDaemonClient() call), and the adoption-
// via-list path re-attaches to live sessions on the respawned daemon. Without
// this, sockets stay open and input/resize silently fail because the daemon
// reference is dead.
//
// We also clear the in-memory sessions map so a stale subscription closure
// doesn't keep firing for sessions that no longer match daemon state.
/**
 * Session ids a live daemon currently owns, or null when no daemon answers
 * (still respawning, or gone for good). Read via the supervisor rather than
 * the client singleton so a rebuilt connection isn't required.
 */
async function listDaemonAliveSessionIds(): Promise<Set<string> | null> {
	const organizationId = process.env.ORGANIZATION_ID;
	if (!organizationId) return null;
	const list = await getSupervisor().listSessions(organizationId);
	if (list === null) return null;
	return new Set(list.filter((info) => info.alive).map((info) => info.id));
}

onDaemonDisconnect((err) => {
	const sessionCount = sessions.size;
	if (sessionCount === 0) return;
	console.warn(
		`[terminal] pty-daemon disconnected (${err?.message ?? "no message"}); closing ${sessionCount} terminal WS socket(s) to trigger renderer reconnect`,
	);
	// If the ptys died with the daemon, their agent bindings become resume
	// candidates — but a disconnect can also be an upgrade handoff or socket
	// blip with sessions surviving for adoption, so the sweep verifies
	// against a live daemon before marking anything.
	void sweepAgentBindingsAfterDaemonLoss({
		candidates: [...sessions.values()].map((session) => ({
			terminalId: session.terminalId,
			db: session.db,
		})),
		listAliveSessionIds: listDaemonAliveSessionIds,
	});
	for (const session of sessions.values()) {
		cancelShellReady(session);
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
		try {
			session.modeTracker.dispose();
		} catch {
			// best-effort
		}
	}
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
		cancelShellReady(session);
		if (session.unsubscribeDaemon) {
			try {
				session.unsubscribeDaemon();
			} catch {
				// best-effort
			}
		}
		try {
			session.modeTracker.dispose();
		} catch {
			// best-effort
		}
	}
	sessions.clear();
}

/**
 * Whether a terminal id has a live in-memory session on this host-service
 * process. Such sessions already drive their own port scanning and unregister
 * themselves via the daemon exit subscription, so the port-scan sync must leave
 * them alone. Returns false for sessions the daemon still owns but that this
 * process hasn't re-created since its last restart.
 */
export function isLiveTerminalSession(terminalId: string): boolean {
	const session = sessions.get(terminalId);
	return session !== undefined && !session.exited;
}

/**
 * Whether a live session has a foreground command running (vs. sitting at an
 * idle shell prompt). Drives the "close anyway?" confirm on pane close. Unknown
 * sessions, idle prompts, and sessions owned by another workspace return false.
 */
export function sessionHasRunningProcess(
	terminalId: string,
	workspaceId: string,
): boolean {
	const session = sessions.get(terminalId);
	if (!session || session.exited) return false;
	// Ownership gate: don't let one workspace probe another's terminals.
	if (session.workspaceId !== workspaceId) return false;
	return hasRunningForegroundProcess(session.pty.pid);
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

/**
 * Workspace session list sourced from truth, not from this process's memory.
 *
 * The in-memory map is attachment plumbing: it empties on every host-service
 * restart while the detached pty-daemon keeps PTYs alive, and it only
 * repopulates when a renderer attaches. Reading it alone made every pane-less
 * session (background agents) invisible to the session dropdown, the
 * background-terminals dropdown, and pane auto-adoption after a restart.
 *
 * So: in-memory sessions first (they carry liveness, titles, attachment, and
 * respect `listed` for hidden internal sessions), then every other alive
 * daemon session joined to an active workspace-owned row. Dispose-stamped
 * rows are scheduled kills awaiting the reaper — never resurfaced. A session
 * only the daemon knows has never been attached in this process's lifetime,
 * hence `attached: false, title: null`.
 */
export async function listWorkspaceTerminalSessions(
	db: HostDb,
	workspaceId: string,
): Promise<TerminalSessionSummary[]> {
	// `getDaemonClient` gates on the daemon bootstrap (waitForDaemonReady +
	// supervisor.ensure), so a query racing a host-service restart blocks
	// until the daemon is adopted instead of observing it as unreachable.
	let daemonAliveIds: string[] | null;
	try {
		const daemon = await getDaemonClient();
		daemonAliveIds = (await daemon.list())
			.filter((session) => session.alive)
			.map((session) => session.id);
	} catch (error) {
		// Daemon genuinely down — its PTYs died with it, so the in-memory
		// view is the whole truth. The dropdowns' polls re-query, so a
		// transient connection failure self-heals.
		console.warn(
			"[terminal] listWorkspaceTerminalSessions: daemon unreachable, serving in-memory view",
			{ workspaceId, error },
		);
		daemonAliveIds = null;
	}

	// Snapshot memory AFTER the daemon await so a session disposed while the
	// lookup was in flight can't be returned with stale live state.
	const known = listTerminalSessions({ workspaceId, includeExited: false });
	if (daemonAliveIds === null) return known;

	const daemonSessionIds = daemonAliveIds.filter((id) => !sessions.has(id));
	if (daemonSessionIds.length === 0) return known;

	const rows = db
		.select({
			id: terminalSessions.id,
			originWorkspaceId: terminalSessions.originWorkspaceId,
			status: terminalSessions.status,
			createdAt: terminalSessions.createdAt,
			disposeRequestedAt: terminalSessions.disposeRequestedAt,
		})
		.from(terminalSessions)
		.where(inArray(terminalSessions.id, daemonSessionIds))
		.all();

	const merged = [...known];
	for (const row of rows) {
		if (row.originWorkspaceId !== workspaceId) continue;
		if (row.status !== "active") continue;
		if (row.disposeRequestedAt != null) continue;
		merged.push({
			terminalId: row.id,
			workspaceId,
			createdAt: row.createdAt,
			exited: false,
			exitCode: 0,
			attached: false,
			title: null,
		});
	}
	return merged;
}

export function writeInputToSession({
	terminalId,
	workspaceId,
	data,
}: {
	terminalId: string;
	workspaceId: string;
	data: string;
}): { success: true } | { error: string } {
	const session = sessions.get(terminalId);
	if (!session) {
		return { error: "Terminal session not found" };
	}
	if (session.workspaceId !== workspaceId) {
		return { error: "Terminal session does not belong to this workspace" };
	}
	if (session.exited) {
		return { error: "Terminal session has exited" };
	}

	session.pty.write(data);
	return { success: true };
}

// Ring-buffer replay after adoption arrives asynchronously over the daemon
// socket, and it is what rebuilds the mode tracker (bracketed paste, screen
// content). Protocol v2 has no replay-complete signal, so watch the replayed
// bytes accumulate — they land in session.buffer, since no renderer is
// attached right after adoption — and return once they quiesce.
const ADOPTION_REPLAY_WAIT_MS = 500;

async function waitForAdoptionReplay(session: TerminalSession): Promise<void> {
	const deadline = Date.now() + ADOPTION_REPLAY_WAIT_MS;
	let seen = -1;
	while (Date.now() < deadline) {
		const count = session.bufferBytes;
		if (count > 0 && count === seen) return;
		seen = count;
		await new Promise((resolve) => setTimeout(resolve, 25));
	}
}

/**
 * In-flight headless adoptions by terminal id. Concurrent callers racing an
 * adoption would each build their own TerminalSession (independent
 * followUpWriteChain, duplicate daemon subscriptions) — sharing the leader's
 * attempt keeps session identity unique per terminal.
 */
const adoptionsInFlight = new Map<string, Promise<unknown>>();

/**
 * Resolve a session for headless IO. The in-memory map empties on every
 * host-service restart while the detached daemon keeps PTYs alive, so a
 * miss is not "gone" — recover it the same way pane auto-adoption does.
 */
async function getOrAdoptSession({
	terminalId,
	workspaceId,
	db,
	eventBus,
}: {
	terminalId: string;
	workspaceId: string;
	db: HostDb;
	eventBus?: EventBus;
}): Promise<TerminalSession | { error: string }> {
	for (;;) {
		const existing = sessions.get(terminalId);
		if (existing) {
			if (existing.workspaceId !== workspaceId) {
				return { error: "Terminal session does not belong to this workspace" };
			}
			return existing;
		}

		// Another caller is mid-adoption: wait it out, then re-resolve so
		// this caller runs its own workspace check (or leads a fresh attempt
		// if the leader failed).
		const pending = adoptionsInFlight.get(terminalId);
		if (pending) {
			await pending.catch(() => {});
			continue;
		}

		const attempt = (async () => {
			const adopted = await createTerminalSessionInternal({
				terminalId,
				workspaceId,
				db,
				eventBus,
				adoptOnly: true,
			});
			if ("error" in adopted) return adopted;

			await waitForAdoptionReplay(adopted);
			return adopted;
		})();
		adoptionsInFlight.set(terminalId, attempt);
		try {
			return await attempt;
		} finally {
			adoptionsInFlight.delete(terminalId);
		}
	}
}

/**
 * Public "send a follow-up to whatever runs in this terminal" path. Frames
 * the text as a bracketed paste when the running program has that mode on,
 * so embedded newlines reach a TUI agent (claude/codex) as literal newlines
 * rather than premature Enter presses.
 */
export async function writeFramedInputToSession({
	terminalId,
	workspaceId,
	text,
	submit,
	db,
	eventBus,
}: {
	terminalId: string;
	workspaceId: string;
	text: string;
	submit: boolean;
	db: HostDb;
	eventBus?: EventBus;
}): Promise<{ success: true } | { error: string }> {
	const session = await getOrAdoptSession({
		terminalId,
		workspaceId,
		db,
		eventBus,
	});
	if ("error" in session) return session;
	if (session.exited) {
		return { error: "Terminal session has exited" };
	}

	// Serialize sends per session: the delayed Enter opens a window where a
	// concurrent send's text (even a submit: false draft) would land between
	// this text and its Enter and get submitted by it.
	const previous = session.followUpWriteChain ?? Promise.resolve();
	const task = previous.then(
		async (): Promise<{ success: true } | { error: string }> => {
			if (session.exited) {
				return { error: "Terminal session has exited" };
			}
			const framed = session.modeTracker.isBracketedPasteActive()
				? `\x1b[200~${text}\x1b[201~`
				: text;
			if (!submit) {
				session.pty.write(framed);
				return { success: true };
			}
			if (text.length > 0) {
				session.pty.write(framed);
				await new Promise((r) => setTimeout(r, FOLLOW_UP_ENTER_DELAY_MS));
				if (session.exited) {
					return { error: "Terminal session has exited" };
				}
			}
			session.pty.write("\r");
			return { success: true };
		},
	);
	session.followUpWriteChain = task.then(
		() => undefined,
		() => undefined,
	);
	return task;
}

/**
 * Non-destructive read of the terminal's current screen (and recent
 * scrollback) off the per-session headless emulator. For TUI agents this is
 * the alt-screen the agent renders to — i.e. its visible output.
 */
export async function snapshotSession({
	terminalId,
	workspaceId,
	maxLines,
	db,
	eventBus,
}: {
	terminalId: string;
	workspaceId: string;
	maxLines?: number;
	db: HostDb;
	eventBus?: EventBus;
}): Promise<({ success: true } & TerminalSnapshot) | { error: string }> {
	const session = await getOrAdoptSession({
		terminalId,
		workspaceId,
		db,
		eventBus,
	});
	if ("error" in session) return session;
	return { success: true, ...session.modeTracker.snapshot(maxLines) };
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

function retainOutput(session: TerminalSession, data: Uint8Array) {
	session.retained.push(data);
	session.retainedBytes += data.byteLength;
	session.outputSeq += data.byteLength;
	while (
		session.retainedBytes > CATCHUP_RING_CAP_BYTES &&
		session.retained.length > 1
	) {
		const removed = session.retained.shift();
		if (removed) {
			session.retainedBytes -= removed.byteLength;
			session.retainedStartSeq += removed.byteLength;
		}
	}
}

/** Concatenate the retained stream from absolute seq `from` to the present. */
function readRetainedFrom(session: TerminalSession, from: number): Uint8Array {
	let skip = from - session.retainedStartSeq;
	const parts: Uint8Array[] = [];
	let total = 0;
	for (const chunk of session.retained) {
		if (skip >= chunk.byteLength) {
			skip -= chunk.byteLength;
			continue;
		}
		const part = skip > 0 ? chunk.subarray(skip) : chunk;
		skip = 0;
		parts.push(part);
		total += part.byteLength;
	}
	const out = new Uint8Array(total);
	let offset = 0;
	for (const part of parts) {
		out.set(part, offset);
		offset += part.byteLength;
	}
	return out;
}

/**
 * Single choke point for PTY output: mode tracker, catch-up ring, then
 * broadcast (falling back to the legacy zero-socket FIFO). Every byte that
 * counts toward `outputSeq` MUST flow through here and nowhere else, or
 * seq-aware clients drift out of sync.
 */
function deliverOutput(session: TerminalSession, bytes: Uint8Array) {
	session.modeTracker.feed(bytes);
	retainOutput(session, bytes);
	if (broadcastBytes(session, bytes) === 0) {
		bufferOutput(session, bytes);
	}
}

/**
 * Force the running program to repaint by toggling the PTY one row smaller
 * and back — two real SIGWINCHes (a same-dims resize emits none). Used after
 * a reanchor attach, where the renderer may hold a stale frame that only the
 * program itself can faithfully redraw (the v1 terminal-host's proven
 * recipe; never synthesize screen content the tracker may not have — #6290).
 */
function nudgeRepaint(session: TerminalSession) {
	if (!isCurrentLiveSession(session)) return;
	const { cols, rows } = session;
	// Shrink by a row, growing instead when already at the minimum.
	const toggledRows = rows > MIN_TERMINAL_ROWS ? rows - 1 : rows + 1;
	const generation = session.resizeGeneration;
	session.pty.resize(cols, toggledRows);
	setTimeout(() => {
		// A real client resize landed mid-nudge; it owns the dims now.
		if (!isCurrentLiveSession(session)) return;
		if (session.resizeGeneration !== generation) return;
		session.pty.resize(cols, rows);
	}, REPAINT_NUDGE_RESTORE_MS);
}

/** False once the session exited or was disposed/replaced in the map —
 * lets delayed nudge timers no-op instead of poking a dead PTY. */
function isCurrentLiveSession(session: TerminalSession): boolean {
	return !session.exited && sessions.get(session.terminalId) === session;
}

/**
 * Write the aggregate client focus state to the PTY when the program asked
 * for focus reports (mode 1004). Written unconditionally rather than
 * edge-triggered: the program's belief can drift via in-band reports from
 * individual xterms, so every focus event re-asserts the aggregate truth —
 * a redundant \x1b[I is idempotent to the program.
 */
function syncPtyFocus(session: TerminalSession) {
	if (session.exited) return;
	if (!session.modeTracker.isFocusReportingActive()) return;
	const aggregate = session.focusedSockets.size > 0;
	session.pty.write(aggregate ? "\x1b[I" : "\x1b[O");
}

/**
 * Arm the nudge after a reanchor attach. Wait for the client's own resize
 * first: if its dims differ from the PTY's, that resize already delivers a
 * natural SIGWINCH and the nudge is unnecessary; if they match, nudge. The
 * fallback timer covers clients that never send a resize.
 */
function schedulePendingRepaintNudge(session: TerminalSession) {
	if (session.pendingRepaintNudge !== null) return;
	session.pendingRepaintNudge = setTimeout(() => {
		session.pendingRepaintNudge = null;
		nudgeRepaint(session);
	}, REPAINT_NUDGE_FALLBACK_MS);
}

function clearPendingRepaintNudge(session: TerminalSession) {
	if (session.pendingRepaintNudge === null) return;
	clearTimeout(session.pendingRepaintNudge);
	session.pendingRepaintNudge = null;
}

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

function socketBufferedAmount(socket: TerminalSocket): number {
	const amount = socket.raw?.bufferedAmount;
	return typeof amount === "number" ? amount : 0;
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
		// A renderer that can't keep up lets its send buffer grow without bound.
		// Drop it past the cap rather than buffer forever; it reconnects and
		// replays the tail. Returning this chunk as "not sent" routes it to the
		// bounded replay buffer via the caller's broadcast-or-buffer check.
		if (socketBufferedAmount(socket) > WS_SEND_BUFFER_CAP_BYTES) {
			session.sockets.delete(socket);
			try {
				socket.close(1013, "terminal output back-pressure");
			} catch {
				// best-effort; close may race an already-closing socket
			}
			continue;
		}
		socket.send(tight);
		sent += 1;
	}
	return sent;
}

/**
 * Host-synthesized attach bytes: the mode preamble plus (at most once) the
 * restored notice. Mode-setting escapes (kitty keyboard, bracketed paste,
 * focus, …) are typically emitted once at program startup and broadcast away
 * rather than buffered, so a fresh xterm needs them re-asserted on every
 * attach. Consumes the pending notice — only call when actually delivering
 * to an open socket. Returns null when there is nothing to synthesize.
 */
function takeSynthesizedAttachBytes(
	session: TerminalSession,
): Uint8Array | null {
	const preamble = session.modeTracker.buildPreamble();
	const notice = session.restoredNoticePending ? SESSION_RESTORED_NOTICE : null;
	session.restoredNoticePending = false;
	if (!preamble && !notice) return null;
	const combined = new Uint8Array(
		(preamble?.byteLength ?? 0) + (notice?.byteLength ?? 0),
	);
	if (preamble) combined.set(preamble, 0);
	if (notice) combined.set(notice, preamble?.byteLength ?? 0);
	return combined;
}

export function replayBuffer(session: TerminalSession, socket: TerminalSocket) {
	// Bail before consuming the notice/FIFO on a non-open socket so the next
	// attach can still replay them.
	if (socket.readyState !== SOCKET_OPEN) return;
	const synthesized = takeSynthesizedAttachBytes(session);
	if (synthesized) sendBytes(socket, synthesized);
	if (session.bufferBytes > 0) {
		const fifo = new Uint8Array(session.bufferBytes);
		let offset = 0;
		for (const b of session.buffer) {
			fifo.set(b, offset);
			offset += b.byteLength;
		}
		sendBytes(socket, fifo);
	}
	session.buffer.length = 0;
	session.bufferBytes = 0;
}

/**
 * Attach delivery for seq-aware clients. Wire order matters:
 *   1. binary: host-synthesized bytes (mode preamble, restored notice) —
 *      NOT part of the PTY stream, so they go out before the anchor and the
 *      client does not count them;
 *   2. json `synced`: sets the client's counter and arms counting;
 *   3. binary: catch-up bytes — pure PTY-stream bytes the client counts.
 * After this returns, live output broadcast keeps both counters in step.
 */
function sendSeqAttach(
	session: TerminalSession,
	socket: TerminalSocket,
	request: Exclude<SeqAttachRequest, { kind: "legacy" }>,
) {
	if (socket.readyState !== SOCKET_OPEN) return;

	const synthesized = takeSynthesizedAttachBytes(session);
	if (synthesized) sendBytes(socket, synthesized);

	const exact =
		request.kind === "anchor" &&
		request.epoch === session.epoch &&
		request.seq >= session.retainedStartSeq &&
		request.seq <= session.outputSeq;

	if (exact) {
		sendMessage(socket, {
			type: "synced",
			epoch: session.epoch,
			seq: request.seq,
			mode: "exact",
		});
		if (request.seq < session.outputSeq) {
			sendBytes(socket, readRetainedFrom(session, request.seq));
		}
		return;
	}

	if (request.kind === "new") {
		// Virgin client: best-effort scrollback restore from the ring tail.
		sendMessage(socket, {
			type: "synced",
			epoch: session.epoch,
			seq: session.retainedStartSeq,
			mode: "tail",
		});
		if (session.retainedBytes > 0) {
			sendBytes(socket, readRetainedFrom(session, session.retainedStartSeq));
		}
		return;
	}

	// Unknown/unrecoverable position ("none", epoch mismatch, gap beyond the
	// ring). The client's existing screen beats anything we could synthesize —
	// never overwrite it (#6290). Re-anchor at the live head and ask the
	// program to repaint itself.
	sendMessage(socket, {
		type: "synced",
		epoch: session.epoch,
		seq: session.outputSeq,
		mode: "reanchor",
	});
	if (!session.exited) {
		schedulePendingRepaintNudge(session);
	}
}

function clearShellReadyTimeout(session: TerminalSession): void {
	if (session.shellReadyTimeoutId) {
		clearTimeout(session.shellReadyTimeoutId);
		session.shellReadyTimeoutId = null;
	}
}

/** Transition out of `pending` on marker match or timeout expiry. */
function resolveShellReady(
	session: TerminalSession,
	state: "ready" | "timed_out",
): void {
	if (session.shellReadyState !== "pending") return;
	session.shellReadyState = state;
	clearShellReadyTimeout(session);
	// On timeout the scanner may be withholding a partial marker prefix that
	// never completed — those bytes are real output and must be released.
	if (session.scanState.heldBytes.length > 0) {
		const heldBytes = Uint8Array.from(session.scanState.heldBytes);
		session.scanState.heldBytes.length = 0;
		session.scanState.matchPos = 0;
		deliverOutput(session, heldBytes);
	}
	if (session.shellReadyResolve) {
		session.shellReadyResolve();
		session.shellReadyResolve = null;
	}
}

/** Release pending readiness waiters without allowing queued input to run. */
function cancelShellReady(session: TerminalSession): void {
	if (session.shellReadyState !== "pending") return;
	session.shellReadyState = "cancelled";
	clearShellReadyTimeout(session);
	if (session.shellReadyResolve) {
		session.shellReadyResolve();
		session.shellReadyResolve = null;
	}
}

/**
 * A staged launch script normally lives well under a second (self-deletes on
 * execution; unlinked on pre-Enter teardown), but a host-service crash inside
 * that window skips both paths and leaves the prompt-bearing file behind.
 * Sweep stale ones at boot — age-gated so a concurrently-running instance's
 * just-staged script is never touched.
 */
const LAUNCH_SCRIPT_STALE_MS = 60 * 60 * 1000;
void (async () => {
	try {
		const dir = tmpdir();
		for (const name of await readdir(dir)) {
			if (!name.startsWith("superset-launch-")) continue;
			const scriptPath = join(dir, name);
			try {
				const { mtimeMs } = await stat(scriptPath);
				if (Date.now() - mtimeMs > LAUNCH_SCRIPT_STALE_MS) {
					await rm(scriptPath, { force: true });
				}
			} catch {
				// raced another instance's sweep — skip
			}
		}
	} catch (error) {
		// Non-fatal, but this sweep is the only cleanup for crash-stranded
		// prompt-bearing scripts — surface the miss instead of hiding it.
		console.warn("[terminal] stale launch-script sweep failed", { error });
	}
})();

/**
 * Stage an oversized initialCommand as a temp script and return the short
 * source line to type instead, keeping the typed input under MAX_CANON.
 * Sourcing (not `sh <path>`) preserves the interactive shell context, so the
 * command behaves exactly as if typed. The script deletes itself on its first
 * line — the shell keeps reading from the already-open fd — so cleanup never
 * waits on a long-running agent process. Returns null when the write fails;
 * the caller falls back to typing the full text.
 */
function stageInitialCommandScript(
	session: TerminalSession,
	commandText: string,
): { typedLine: string; scriptPath: string } | null {
	const safeId = session.terminalId.replace(/[^\w-]/g, "_").slice(0, 60);
	const scriptPath = join(
		tmpdir(),
		`superset-launch-${safeId}-${randomBytes(4).toString("hex")}.sh`,
	);
	// tmpdir paths never contain quotes, so this quoting is identical in
	// POSIX shells and fish.
	const quotedPath = `'${scriptPath.replaceAll("'", "'\\''")}'`;
	const sourceKeyword = session.launchShellName === "fish" ? "source" : ".";
	try {
		writeFileSync(
			scriptPath,
			`command rm -f -- ${quotedPath}\n${commandText}\n`,
			{ mode: 0o600, flag: "wx" },
		);
	} catch (error) {
		console.warn("[terminal] failed to stage long initial command; typing it", {
			terminalId: session.terminalId,
			error,
		});
		return null;
	}
	return { typedLine: `${sourceKeyword} ${quotedPath}`, scriptPath };
}

function queueInitialCommand(
	session: TerminalSession,
	initialCommand: string,
): void {
	if (session.initialCommandQueued || session.exited) return;
	session.initialCommandQueued = true;
	const commandText = initialCommand.replace(/[\r\n]+$/, "");
	// Marker-backed shells can run interactive startup hooks that read or flush
	// PTY input before the first prompt (direnv/devenv is one example). Wait for
	// that prompt so the command cannot be consumed as startup input. Launches
	// without a verified marker resolve this promise immediately, and a missing
	// marker resolves it via SHELL_READY_TIMEOUT_MS — the command must
	// eventually run; only session teardown may cancel it.
	// Dispose paths that never see onExit (daemon callbacks are unsubscribed
	// first) leave `exited` false and a non-pending readyState untouched —
	// only the registry reliably says the session is gone.
	const isDefunct = () =>
		session.exited ||
		session.shellReadyState === "cancelled" ||
		sessions.get(session.terminalId) !== session;
	void session.shellReadyPromise.then(() => {
		if (isDefunct()) return;
		// Even after the marker, the TTY is still in canonical mode (the marker
		// fires from precmd, before the line editor takes over), so whatever we
		// type here rides the kernel's MAX_CANON line limit. Long commands go
		// to disk; only a short source line is typed.
		let typedText = commandText;
		let scriptPath: string | null = null;
		if (
			Buffer.byteLength(commandText, "utf8") > MAX_TYPED_INITIAL_COMMAND_BYTES
		) {
			const staged = stageInitialCommandScript(session, commandText);
			if (staged) {
				typedText = staged.typedLine;
				scriptPath = staged.scriptPath;
			}
		}
		// The OSC 133;A marker fires from precmd, which runs BEFORE the line
		// editor starts reading input. Plugin init in that gap (vi-mode,
		// syntax-highlighting) can flush the PTY input queue mid-read, eating a
		// trailing newline sent in the same write: the command text survives in
		// the editor's buffer but never executes. Send Enter as its own delayed
		// write — and as `\r`, what a real Enter key sends, bound to accept-line
		// in every keymap — so it lands after the init storm. One Enter total,
		// so a double-run is impossible.
		session.pty.write(typedText);
		setTimeout(() => {
			if (isDefunct()) {
				// Enter never sent — the staged script won't run, so it can't
				// self-delete.
				if (scriptPath) void rm(scriptPath, { force: true }).catch(() => {});
				return;
			}
			session.pty.write("\r");
		}, INITIAL_COMMAND_ENTER_DELAY_MS);
	});
}

interface DaemonCloseResult {
	attempted: boolean;
	succeeded: boolean;
	error?: unknown;
}

export interface DisposeSessionResult {
	terminalId: string;
	daemonCloseAttempted: boolean;
	daemonCloseSucceeded: boolean;
}

function toDaemonSignal(signal?: NodeJS.Signals): DaemonSignal {
	switch (signal) {
		case "SIGINT":
		case "SIGTERM":
		case "SIGKILL":
		case "SIGHUP":
			return signal;
		default:
			return "SIGHUP";
	}
}

function isUnknownDaemonSessionError(error: unknown): boolean {
	if (!(error instanceof Error)) return false;
	return error.message.includes("unknown session:");
}

function reachableDaemonSocketPath(): string | null {
	const explicitSocket = process.env.SUPERSET_PTY_DAEMON_SOCKET;
	if (explicitSocket) return explicitSocket;

	const organizationId = process.env.ORGANIZATION_ID;
	if (!organizationId) return null;

	const manifest = readPtyDaemonManifest(organizationId);
	if (!manifest || !isProcessAlive(manifest.pid)) return null;
	return manifest.socketPath;
}

async function closeDaemonSessionById(
	terminalId: string,
	signal: DaemonSignal = "SIGHUP",
): Promise<DaemonCloseResult> {
	const socketPath = reachableDaemonSocketPath();
	if (!socketPath) return { attempted: false, succeeded: true };

	const daemon = new DaemonClient({ socketPath, connectTimeoutMs: 1000 });
	try {
		await daemon.connect();
		await daemon.close(terminalId, signal);
		return { attempted: true, succeeded: true };
	} catch (error) {
		if (isUnknownDaemonSessionError(error)) {
			return { attempted: true, succeeded: true };
		}
		return { attempted: true, succeeded: false, error };
	} finally {
		await daemon.dispose().catch(() => {});
	}
}

/**
 * Kills the PTY (if live) and marks the DB row disposed. Safe to call even
 * when there's no in-memory session — e.g. for zombie `active` rows left
 * over from a prior crash. Exported so workspaceCleanup can dispose the
 * transient teardown session.
 */
export function disposeSession(terminalId: string, db: HostDb) {
	void disposeSessionAndWait(terminalId, db)
		.then((result) => {
			if (!result.daemonCloseSucceeded) {
				console.warn("[terminal] disposeSession daemon close failed", {
					terminalId,
				});
			}
		})
		.catch((error) => {
			console.warn("[terminal] disposeSession failed", { terminalId, error });
		});
}

export async function disposeSessionAndWait(
	terminalId: string,
	db: HostDb,
): Promise<DisposeSessionResult> {
	// Durable intent-to-kill: if this attempt fails (daemon hiccup, host
	// restart mid-kill), the reaper retries any stamped row — a one-shot
	// renderer broadcast must not be the only chance to kill a session.
	// First request time wins so retries don't look like fresh requests.
	db.update(terminalSessions)
		.set({ disposeRequestedAt: Date.now() })
		.where(
			and(
				eq(terminalSessions.id, terminalId),
				isNull(terminalSessions.disposeRequestedAt),
			),
		)
		.run();
	const session = sessions.get(terminalId);
	let closePromise: Promise<DaemonCloseResult> | null = null;

	if (session) {
		cancelShellReady(session);
		for (const socket of session.sockets) {
			socket.close(1000, "Session disposed");
		}
		session.sockets.clear();
		if (!session.exited) {
			try {
				closePromise = session.pty.kill().then(
					() =>
						({ attempted: true, succeeded: true }) satisfies DaemonCloseResult,
					(error) => ({
						attempted: true,
						succeeded: isUnknownDaemonSessionError(error),
						error,
					}),
				);
			} catch (error) {
				closePromise = Promise.resolve({
					attempted: true,
					succeeded: isUnknownDaemonSessionError(error),
					error,
				});
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
		try {
			session.modeTracker.dispose();
		} catch {
			// best-effort
		}
		sessions.delete(terminalId);
	} else {
		closePromise = closeDaemonSessionById(terminalId, "SIGHUP");
	}

	portManager.unregisterSession(terminalId);

	const closeResult = closePromise
		? await closePromise
		: { attempted: false, succeeded: true };

	if (closeResult.succeeded) {
		const endedAt = Date.now();
		db.update(terminalSessions)
			.set({ status: "disposed", endedAt })
			.where(eq(terminalSessions.id, terminalId))
			.run();

		// Dispose unsubscribed the daemon callbacks above, so onExit will
		// never fire for this session — announce the exit here (after the
		// row flips to disposed, so refetching readers see it dead). Skip
		// sessions whose pty already exited: onExit broadcast that one.
		if (session && !session.exited) {
			session.eventBus?.broadcastTerminalLifecycle({
				workspaceId: session.workspaceId,
				terminalId,
				eventType: "exit",
				exitCode: 0,
				signal: 0,
				occurredAt: endedAt,
			});
		}
	}

	return {
		terminalId,
		daemonCloseAttempted: closeResult.attempted,
		daemonCloseSucceeded: closeResult.succeeded,
	};
}

/**
 * Dispose every active session belonging to the given workspace, then drop the
 * confirmed-dead rows so the workspace's session index dies with it rather than
 * lingering as `set null` orphans. A still-`active` row is a failed kill we keep
 * reachable for the reaper. Returns counts so callers (e.g.
 * workspaceCleanup.destroy) can surface warnings.
 */
export async function disposeSessionsByWorkspaceId(
	workspaceId: string,
	db: HostDb,
): Promise<{ terminated: number; failed: number }> {
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
			const result = await disposeSessionAndWait(row.id, db);
			if (!result.daemonCloseSucceeded) {
				failed += 1;
				continue;
			}
			terminated += 1;
		} catch {
			failed += 1;
		}
	}

	db.delete(terminalSessions)
		.where(
			and(
				eq(terminalSessions.originWorkspaceId, workspaceId),
				ne(terminalSessions.status, "active"),
			),
		)
		.run();

	return { terminated, failed };
}

/**
 * Dispose every active session for any workspace mapped to the given worktree
 * path. Deleting a closed worktree has no workspace id, so we join through the
 * workspaces table on the shared worktree path.
 */
export async function disposeSessionsByWorktreePath(
	worktreePath: string,
	db: HostDb,
): Promise<{ terminated: number; failed: number }> {
	const workspaceRows = db
		.select({ id: workspaces.id })
		.from(workspaces)
		.where(eq(workspaces.worktreePath, worktreePath))
		.all();

	let terminated = 0;
	let failed = 0;
	for (const { id } of workspaceRows) {
		const result = await disposeSessionsByWorkspaceId(id, db);
		terminated += result.terminated;
		failed += result.failed;
	}
	return { terminated, failed };
}

interface CreateTerminalSessionOptions {
	terminalId: string;
	workspaceId: string;
	themeType?: "dark" | "light";
	db: HostDb;
	eventBus?: EventBus;
	initialCommand?: string;
	cwd?: string;
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
	/**
	 * Deliver a "session restored" separator ahead of the first replay. Set on
	 * the cold-restore respawn path, where the renderer paints stale scrollback
	 * above a brand-new shell.
	 */
	restoredNotice?: boolean;
}

function resolveTerminalCwd(
	cwdOverride: string | undefined,
	worktreePath: string,
): string {
	if (!cwdOverride) return worktreePath;
	if (isAbsolute(cwdOverride)) {
		return existsSync(cwdOverride) ? cwdOverride : worktreePath;
	}

	const relativePath = cwdOverride.startsWith("./")
		? cwdOverride.slice(2)
		: cwdOverride;
	const resolvedPath = join(worktreePath, relativePath);
	return existsSync(resolvedPath) ? resolvedPath : worktreePath;
}

function getTerminalWorkspaceMismatchError({
	terminalId,
	ownerWorkspaceId,
	requestedWorkspaceId,
}: {
	terminalId: string;
	ownerWorkspaceId: string | null | undefined;
	requestedWorkspaceId: string;
}): string | null {
	if (!ownerWorkspaceId || ownerWorkspaceId === requestedWorkspaceId) {
		return null;
	}

	return `Terminal session "${terminalId}" belongs to workspace "${ownerWorkspaceId}", not "${requestedWorkspaceId}".`;
}

export async function createTerminalSessionInternal({
	terminalId,
	workspaceId,
	themeType,
	db,
	eventBus,
	initialCommand,
	cwd: cwdOverride,
	listed = true,
	cols: requestedCols,
	rows: requestedRows,
	adoptOnly = false,
	replayOnAdoption = true,
	restoredNotice = false,
}: CreateTerminalSessionOptions): Promise<TerminalSession | { error: string }> {
	const existing = sessions.get(terminalId);
	if (existing) {
		const mismatchError = getTerminalWorkspaceMismatchError({
			terminalId,
			ownerWorkspaceId: existing.workspaceId,
			requestedWorkspaceId: workspaceId,
		});
		if (mismatchError) return { error: mismatchError };

		if (listed) existing.listed = true;
		if (initialCommand) queueInitialCommand(existing, initialCommand);
		return existing;
	}

	const existingRecord = db.query.terminalSessions
		.findFirst({ where: eq(terminalSessions.id, terminalId) })
		.sync();
	const recordMismatchError = getTerminalWorkspaceMismatchError({
		terminalId,
		ownerWorkspaceId: existingRecord?.originWorkspaceId,
		requestedWorkspaceId: workspaceId,
	});
	if (recordMismatchError) return { error: recordMismatchError };

	const workspace = db.query.workspaces
		.findFirst({ where: eq(workspaces.id, workspaceId) })
		.sync();

	if (!workspace) {
		return { error: "Workspace not found" };
	}
	if (!existsSync(workspace.worktreePath)) {
		return {
			error: `Workspace worktree no longer exists: ${workspace.worktreePath}`,
		};
	}

	// Derive root path from the workspace's project. Session workspaces
	// (null projectId) have no main repo; the session dir is the only root.
	let rootPath = "";
	const project = workspace.projectId
		? db.query.projects
				.findFirst({ where: eq(projects.id, workspace.projectId) })
				.sync()
		: undefined;
	if (project?.repoPath) {
		rootPath = project.repoPath;
	}

	const cwd = resolveTerminalCwd(cwdOverride, workspace.worktreePath);
	// Adoption overrides these with the PTY's live dims below: the session's
	// belief must match the kernel's, or the reanchor repaint logic misjudges
	// whether a client resize will deliver a real SIGWINCH.
	let cols = normalizeTerminalDimension(
		requestedCols,
		MIN_TERMINAL_COLS,
		DEFAULT_TERMINAL_COLS,
	);
	let rows = normalizeTerminalDimension(
		requestedRows,
		MIN_TERMINAL_ROWS,
		DEFAULT_TERMINAL_ROWS,
	);

	// Use the preserved shell snapshot — never live process.env. Resolution
	// runs in the background at startup so the server can listen immediately;
	// wait for it here before the first PTY needs the snapshot.
	await waitForTerminalBaseEnv();
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
			cols = normalizeTerminalDimension(found.cols, MIN_TERMINAL_COLS, cols);
			rows = normalizeTerminalDimension(found.rows, MIN_TERMINAL_ROWS, rows);
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
					cols = normalizeTerminalDimension(
						found.cols,
						MIN_TERMINAL_COLS,
						cols,
					);
					rows = normalizeTerminalDimension(
						found.rows,
						MIN_TERMINAL_ROWS,
						rows,
					);
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
			set: {
				originWorkspaceId: workspaceId,
				status: "active",
				createdAt,
				endedAt: null,
			},
		})
		.run();

	// Determine shell readiness support. Adopted sessions are already past
	// shell startup, so treat them as immediately ready — the OSC 133;A
	// marker has already flown by and we don't want to gate writes on it.
	const shellSupportsReady =
		!isAdopted && shellLaunchExpectsReadyMarker({ shell, supersetHomeDir });

	let shellReadyResolve: (() => void) | null = null;
	const shellReadyPromise = shellSupportsReady
		? new Promise<void>((resolve) => {
				shellReadyResolve = resolve;
			})
		: Promise.resolve();

	const session: TerminalSession = {
		terminalId,
		workspaceId,
		db,
		pty,
		cols,
		rows,
		unsubscribeDaemon: null,
		sockets: new Set(),
		buffer: [],
		bufferBytes: 0,
		// Adopted sessions kept a live shell — nothing was restored.
		restoredNoticePending: restoredNotice && !isAdopted,
		createdAt,
		exited: false,
		exitCode: 0,
		exitSignal: 0,
		listed,
		title: null,
		titleScanState: createTerminalTitleScanState(),
		eventBus,
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
		launchShellName: basename(shell),
		portHintDecoder: new StringDecoder("utf8"),
		modeTracker: createModeTracker(cols, rows),
		epoch: randomBytes(8).toString("hex"),
		outputSeq: 0,
		retained: [],
		retainedBytes: 0,
		retainedStartSeq: 0,
		pendingRepaintNudge: null,
		resizeGeneration: 0,
		focusedSockets: new Set(),
	};
	sessions.set(terminalId, session);
	portManager.upsertSession(terminalId, workspaceId, pty.pid);

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
				// Runs even when the decoder buffers a partial codepoint into ""
				// — the chunk is still output and must refresh the idle clock.
				portManager.checkOutputForHint(terminalId, hintText);

				deliverOutput(session, bytes);
			},
			onExit({ code, signal }) {
				session.exited = true;
				cancelShellReady(session);
				session.exitCode = code ?? 0;
				session.exitSignal = signal ?? 0;
				const occurredAt = Date.now();

				portManager.unregisterSession(terminalId);

				db.update(terminalSessions)
					.set({ status: "exited", endedAt: occurredAt })
					.where(eq(terminalSessions.id, terminalId))
					.run();

				// The agent died with the pty; unless its SessionEnd hook already
				// marked a clean detach, keep the binding as a resume candidate.
				try {
					markTerminalAgentBindingEnded(
						db,
						terminalId,
						"terminal-exited",
						occurredAt,
					);
				} catch (error) {
					console.warn(
						`[terminal] failed to mark agent binding ended for ${terminalId}`,
						error,
					);
				}

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
					occurredAt,
				});
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
			cwd?: string;
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
			cwd: body.cwd,
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

	app.get("/terminal/resource-sessions", async (c) => {
		try {
			const daemon = await getDaemonClient();
			const titlesByTerminalId = new Map(
				Array.from(sessions.values()).map((session) => [
					session.terminalId,
					session.title,
				]),
			);
			return c.json({
				sessions: listTerminalResourceSessions(
					db,
					await daemon.list(),
					titlesByTerminalId,
				),
			});
		} catch (error) {
			console.warn("[terminal] Failed to list resource sessions", error);
			return c.json({ sessions: [] });
		}
	});

	app.get(
		"/terminal/:terminalId",
		upgradeWebSocket((c) => {
			const terminalId = c.req.param("terminalId") ?? "";
			const requestedWorkspaceId = c.req.query("workspaceId") || null;
			const seqRequest = parseSeqAttachParam(c.req.query("seq"));
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
				if (seqRequest.kind === "legacy") {
					replayBuffer(session, ws);
				} else {
					sendSeqAttach(session, ws, seqRequest);
				}
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
				TerminalSession | { error: string; code?: "session-gone" }
			> => {
				const existing = sessions.get(terminalId);
				if (existing) {
					if (requestedWorkspaceId) {
						const mismatchError = getTerminalWorkspaceMismatchError({
							terminalId,
							ownerWorkspaceId: existing.workspaceId,
							requestedWorkspaceId,
						});
						if (mismatchError) return { error: mismatchError };
					}
					return existing;
				}

				const record = db.query.terminalSessions
					.findFirst({ where: eq(terminalSessions.id, terminalId) })
					.sync();
				if (!record) {
					return {
						error: `Terminal session "${terminalId}" not found; create it before connecting.`,
						code: "session-gone",
					};
				}
				if (record.status === "disposed") {
					return {
						error: `Terminal session "${terminalId}" is disposed.`,
						code: "session-gone",
					};
				}
				if (record.status === "exited") {
					return {
						error: `Terminal session "${terminalId}" has exited.`,
						code: "session-gone",
					};
				}
				if (!record.originWorkspaceId) {
					return {
						error: `Terminal session "${terminalId}" is missing a workspace.`,
					};
				}
				if (requestedWorkspaceId) {
					const mismatchError = getTerminalWorkspaceMismatchError({
						terminalId,
						ownerWorkspaceId: record.originWorkspaceId,
						requestedWorkspaceId,
					});
					if (mismatchError) return { error: mismatchError };
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
					// Only a client with an empty xterm wants the daemon ring
					// dumped at it. Anchored/reanchor clients keep their own
					// (better) copy; legacy clients signal via `?replay=0`.
					replayOnAdoption:
						seqRequest.kind === "legacy"
							? c.req.query("replay") !== "0"
							: seqRequest.kind === "new",
				});
				if (!("error" in adopted)) return adopted;

				// Active row but daemon no longer owns the PTY (laptop sleep,
				// daemon restart, machine reboot). Respawn rather than dead-end
				// the pane — the renderer's xterm scrollback stays painted above.
				// Any agent bound to the old PTY died with it without a goodbye;
				// mark its binding ended so it surfaces as a resume candidate.
				console.log(`[terminal] respawning lost session ${terminalId}`);
				try {
					markTerminalAgentBindingEnded(db, terminalId, "terminal-exited");
				} catch (error) {
					console.warn(
						`[terminal] failed to mark agent binding ended for ${terminalId}`,
						error,
					);
				}
				return createTerminalSessionInternal({
					terminalId,
					workspaceId: record.originWorkspaceId,
					themeType,
					db,
					eventBus,
					restoredNotice: true,
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
							sendMessage(ws, {
								type: "error",
								message: session.error,
								code: session.code,
							});
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
						disposeSession(terminalId ?? "", db);
						return;
					}

					if (session.exited) return;

					if (message.type === "input") {
						session.pty.write(message.data);
						return;
					}

					if (message.type === "focus") {
						if (message.focused) {
							session.focusedSockets.add(ws);
						} else {
							session.focusedSockets.delete(ws);
						}
						syncPtyFocus(session);
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
						session.resizeGeneration += 1;
						// A reanchor attach waits for this first client resize:
						// changed dims deliver the repaint SIGWINCH naturally;
						// unchanged dims need the forced nudge.
						const needsForcedNudge =
							session.pendingRepaintNudge !== null &&
							cols === session.cols &&
							rows === session.rows;
						clearPendingRepaintNudge(session);
						session.pty.resize(cols, rows);
						session.modeTracker.resize(cols, rows);
						session.cols = cols;
						session.rows = rows;
						if (needsForcedNudge) nudgeRepaint(session);
					}
				},

				onClose: (_event, ws) => {
					const session = sessions.get(terminalId ?? "");
					if (!session) return;
					session.sockets.delete(ws);
					// A departing focused client may hand focus-out to the program
					// (unless another attached client still holds focus).
					if (session.focusedSockets.delete(ws)) syncPtyFocus(session);
				},

				onError: (_event, ws) => {
					const session = sessions.get(terminalId ?? "");
					if (!session) return;
					session.sockets.delete(ws);
					if (session.focusedSockets.delete(ws)) syncPtyFocus(session);
				},
			};
		}),
	);
}
