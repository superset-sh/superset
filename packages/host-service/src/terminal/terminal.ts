import { existsSync } from "node:fs";
import type { NodeWebSocket } from "@hono/node-ws";
import {
	createScanState,
	SHELLS_WITH_READY_MARKER,
	type ShellReadyScanState,
	scanForShellReady,
} from "@superset/shared/shell-ready-scanner";
import { and, eq } from "drizzle-orm";
import type { Hono } from "hono";
import { type IPty, spawn } from "node-pty";
import type { HostDb } from "../db";
import { projects, terminalSessions, workspaces } from "../db/schema";
import {
	buildV2TerminalEnv,
	getShellLaunchArgs,
	getTerminalBaseEnv,
	resolveLaunchShell,
} from "./env";

interface RegisterWorkspaceTerminalRouteOptions {
	app: Hono;
	db: HostDb;
	upgradeWebSocket: NodeWebSocket["upgradeWebSocket"];
}

export function parseThemeType(
	value: string | null | undefined,
): "dark" | "light" | undefined {
	return value === "dark" || value === "light" ? value : undefined;
}

type TerminalClientMessage =
	| { type: "input"; data: string }
	| { type: "resize"; cols: number; rows: number }
	| { type: "dispose" };

type TerminalServerMessage =
	| { type: "data"; data: string }
	| { type: "error"; message: string }
	| { type: "exit"; exitCode: number; signal: number }
	| { type: "replay"; data: string };

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
	pty: IPty;
	sockets: Set<TerminalSocket>;
	buffer: string[];
	bufferBytes: number;
	createdAt: number;
	exited: boolean;
	exitCode: number;
	exitSignal: number;
	listed: boolean;

	// Shell readiness (OSC 133)
	shellReadyState: ShellReadyState;
	shellReadyResolve: (() => void) | null;
	shellReadyPromise: Promise<void>;
	shellReadyTimeoutId: ReturnType<typeof setTimeout> | null;
	scanState: ShellReadyScanState;
}

/** PTY lifetime is independent of socket lifetime — sockets detach/reattach freely. */
const sessions = new Map<string, TerminalSession>();

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
		sessions.delete(terminalId);
	}

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
				eq(terminalSessions.status, "active"),
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
	/** Command to run after the shell is ready. Queued behind shellReadyPromise. */
	initialCommand?: string;
	/** Hidden sessions are process-internal and should not appear in user pickers. */
	listed?: boolean;
}

export function createTerminalSessionInternal({
	terminalId,
	workspaceId,
	themeType,
	db,
	initialCommand,
	listed = true,
}: CreateTerminalSessionOptions): TerminalSession | { error: string } {
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
	});

	let pty: IPty;
	try {
		pty = spawn(shell, shellArgs, {
			name: "xterm-256color",
			cwd,
			cols: 120,
			rows: 32,
			env: ptyEnv,
		});
	} catch (error) {
		return {
			error:
				error instanceof Error ? error.message : "Failed to start terminal",
		};
	}

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

	// Determine shell readiness support
	const shellName = shell.split("/").pop() || shell;
	const shellSupportsReady = SHELLS_WITH_READY_MARKER.has(shellName);

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
		sockets: new Set(),
		buffer: [],
		bufferBytes: 0,
		createdAt,
		exited: false,
		exitCode: 0,
		exitSignal: 0,
		listed,
		shellReadyState: shellSupportsReady ? "pending" : "unsupported",
		shellReadyResolve,
		shellReadyPromise,
		shellReadyTimeoutId: null,
		scanState: createScanState(),
	};
	sessions.set(terminalId, session);

	// If the marker never arrives (broken wrapper, unsupported config),
	// the timeout unblocks so the session degrades gracefully.
	if (session.shellReadyState === "pending") {
		session.shellReadyTimeoutId = setTimeout(() => {
			resolveShellReady(session, "timed_out");
		}, SHELL_READY_TIMEOUT_MS);
	}

	pty.onData((rawData) => {
		// Scan for OSC 133;A and strip it from output
		let data = rawData;
		if (session.shellReadyState === "pending") {
			const result = scanForShellReady(session.scanState, rawData);
			data = result.output;
			if (result.matched) {
				resolveShellReady(session, "ready");
			}
		}
		if (data.length === 0) return;

		if (broadcastMessage(session, { type: "data", data }) === 0) {
			bufferOutput(session, data);
		}
	});

	pty.onExit(({ exitCode, signal }) => {
		session.exited = true;
		session.exitCode = exitCode ?? 0;
		session.exitSignal = signal ?? 0;

		db.update(terminalSessions)
			.set({ status: "exited", endedAt: Date.now() })
			.where(eq(terminalSessions.id, terminalId))
			.run();

		broadcastMessage(session, {
			type: "exit",
			exitCode: session.exitCode,
			signal: session.exitSignal,
		});
	});

	if (initialCommand) {
		const cmd = initialCommand.endsWith("\n")
			? initialCommand
			: `${initialCommand}\n`;
		session.shellReadyPromise.then(() => {
			if (!session.exited) {
				pty.write(cmd);
			}
		});
	}

	return session;
}

export function registerWorkspaceTerminalRoute({
	app,
	db,
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

		const result = createTerminalSessionInternal({
			terminalId: body.terminalId,
			workspaceId: body.workspaceId,
			themeType: parseThemeType(body.themeType),
			db,
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
						// Session must be created via tRPC terminal.ensureSession before connecting.
						// Fall back to query params for backwards compatibility with v1 callers.
						const workspaceId = c.req.query("workspaceId") ?? null;
						if (!workspaceId) {
							sendMessage(ws, {
								type: "error",
								message:
									"Session not found. Call terminal.ensureSession first.",
							});
							ws.close(1011, "Session not found");
							return;
						}

						const themeType = parseThemeType(c.req.query("themeType"));
						const result = createTerminalSessionInternal({
							terminalId,
							workspaceId,
							themeType,
							db,
						});

						if ("error" in result) {
							sendMessage(ws, { type: "error", message: result.error });
							ws.close(1011, result.error);
							return;
						}

						result.sockets.add(ws);

						db.update(terminalSessions)
							.set({ lastAttachedAt: Date.now() })
							.where(eq(terminalSessions.id, terminalId))
							.run();
						return;
					}

					existing.sockets.add(ws);

					db.update(terminalSessions)
						.set({ lastAttachedAt: Date.now() })
						.where(eq(terminalSessions.id, terminalId))
						.run();

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
