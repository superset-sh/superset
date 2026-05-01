import { existsSync } from "node:fs";
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
			const unsub = daemon.subscribe(
				sessionId,
				{ replay: false },
				{
					onOutput: (chunk) => cb(chunk.toString("utf8")),
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
	| { type: "initialCommand"; data: string }
	| { type: "resize"; cols: number; rows: number }
	| { type: "dispose" };

type TerminalServerMessage =
	| { type: "data"; data: string }
	| { type: "error"; message: string }
	| { type: "exit"; exitCode: number; signal: number }
	| { type: "replay"; data: string }
	| { type: "title"; title: string | null };

const MAX_BUFFER_BYTES = 64 * 1024;
const SOCKET_OPEN = 1;
const SOCKET_CLOSING = 2;
const SOCKET_CLOSED = 3;

type TerminalSocket = {
	send: (data: string) => void;
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
	buffer: string[];
	bufferBytes: number;
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

function bufferOutput(session: TerminalSession, data: string) {
	session.buffer.push(data);
	session.bufferBytes += data.length;

	while (session.bufferBytes > MAX_BUFFER_BYTES && session.buffer.length > 1) {
		const removed = session.buffer.shift();
		if (removed) session.bufferBytes -= removed.length;
	}
}

function replayBuffer(
	session: TerminalSession,
	socket: { send: (data: string) => void; readyState: number },
) {
	if (session.buffer.length === 0) return;
	const combined = session.buffer.join("");
	session.buffer.length = 0;
	session.bufferBytes = 0;
	sendMessage(socket, { type: "replay", data: combined });
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
		bufferOutput(session, session.scanState.heldBytes);
		session.scanState.heldBytes = "";
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
	if (session.initialCommandQueued) return;
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
}

export async function createTerminalSessionInternal({
	terminalId,
	workspaceId,
	themeType,
	db,
	eventBus,
	initialCommand,
	listed = true,
}: CreateTerminalSessionOptions): Promise<TerminalSession | { error: string }> {
	const existing = sessions.get(terminalId);
	if (existing) {
		if (listed) existing.listed = true;
		return existing;
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
		try {
			openResult = await daemon.open(terminalId, {
				shell,
				argv: shellArgs,
				cwd,
				cols: 120,
				rows: 32,
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
		createdAt,
		exited: false,
		exitCode: 0,
		exitSignal: 0,
		listed,
		title: null,
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
	};
	sessions.set(terminalId, session);
	portManager.upsertSession(terminalId, workspaceId, pty.pid);

	// If the marker never arrives (broken wrapper, unsupported config),
	// the timeout unblocks so the session degrades gracefully.
	if (session.shellReadyState === "pending") {
		session.shellReadyTimeoutId = setTimeout(() => {
			resolveShellReady(session, "timed_out");
		}, SHELL_READY_TIMEOUT_MS);
	}

	// Subscribe to the daemon's output + exit stream for this session. We
	// pass replay:true so a fresh host-service after a restart picks up
	// whatever the daemon already had buffered for the session.
	session.unsubscribeDaemon = daemon.subscribe(
		terminalId,
		{ replay: true },
		{
			onOutput(chunk) {
				const rawData = chunk.toString("utf8");
				const titleUpdates = scanForTerminalTitle(
					session.titleScanState,
					rawData,
				);
				for (const title of titleUpdates.updates) {
					setSessionTitle(session, title);
				}

				// Scan for OSC 133;A and strip it from output.
				let data = rawData;
				if (session.shellReadyState === "pending") {
					const result = scanForShellReady(session.scanState, rawData);
					data = result.output;
					if (result.matched) {
						resolveShellReady(session, "ready");
					}
				}
				if (data.length === 0) return;

				portManager.checkOutputForHint(data);

				if (broadcastMessage(session, { type: "data", data }) === 0) {
					bufferOutput(session, data);
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

			return {
				onOpen: (_event, ws) => {
					if (!terminalId) {
						ws.close(1011, "Missing terminalId");
						return;
					}

					const existing = sessions.get(terminalId);
					if (!existing) {
						// V2 callers can create a session by opening the WebSocket with
						// workspaceId; this keeps terminal attach out of tRPC request queues.
						const workspaceId = c.req.query("workspaceId") ?? null;
						if (!workspaceId) {
							sendMessage(ws, {
								type: "error",
								message: `Terminal session "${terminalId}" not found; open with workspaceId or create it before connecting.`,
							});
							ws.close(1011, "Terminal session not found");
							return;
						}

						const themeType = parseThemeType(c.req.query("themeType"));
						// Daemon open is async; fire-and-forget while keeping the WS alive.
						// On success: register the socket; on failure: surface and close.
						void (async () => {
							const result = await createTerminalSessionInternal({
								terminalId,
								workspaceId,
								themeType,
								db,
								eventBus,
							});

							if ("error" in result) {
								sendMessage(ws, { type: "error", message: result.error });
								ws.close(1011, result.error);
								return;
							}

							// WS may have closed during the daemon-open await; don't
							// register a dead socket into the session's broadcast set.
							if (ws.readyState !== SOCKET_OPEN) return;

							result.sockets.add(ws);
							sendMessage(ws, { type: "title", title: result.title });

							db.update(terminalSessions)
								.set({ lastAttachedAt: Date.now() })
								.where(eq(terminalSessions.id, terminalId))
								.run();
						})();
						return;
					}

					existing.sockets.add(ws);

					db.update(terminalSessions)
						.set({ lastAttachedAt: Date.now() })
						.where(eq(terminalSessions.id, terminalId))
						.run();

					sendMessage(ws, { type: "title", title: existing.title });
					replayBuffer(existing, ws);
					if (existing.exited) {
						sendMessage(ws, {
							type: "exit",
							exitCode: existing.exitCode,
							signal: existing.exitSignal,
						});
					}
				},

				onMessage: (event, ws) => {
					const session = sessions.get(terminalId ?? "");
					if (!session || !session.sockets.has(ws)) return;

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

					if (message.type === "dispose") {
						disposeSession(terminalId ?? "", db);
						return;
					}

					if (session.exited) return;

					if (message.type === "input") {
						session.pty.write(message.data);
						return;
					}

					if (message.type === "initialCommand") {
						queueInitialCommand(session, message.data);
						return;
					}

					if (message.type === "resize") {
						const cols = Math.max(20, Math.floor(message.cols));
						const rows = Math.max(5, Math.floor(message.rows));
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
