import { existsSync } from "node:fs";
import type { NodeWebSocket } from "@hono/node-ws";
import {
	createScanState,
	SHELLS_WITH_READY_MARKER,
	type ShellReadyScanState,
	scanForShellReady,
} from "@superset/shared/shell-ready-scanner";
import {
	createTerminalCommandScanState,
	scanForTerminalCommandEvents,
	type TerminalCommandEvent,
	type TerminalCommandScanState,
} from "@superset/shared/terminal-command-scanner";
import {
	createTerminalTitleScanState,
	scanForTerminalTitle,
	type TerminalTitleScanState,
} from "@superset/shared/terminal-title-scanner";
import { and, eq, ne } from "drizzle-orm";
import type { Hono } from "hono";
import { type IPty, spawn } from "node-pty";
import type { HostDb } from "../db";
import { projects, terminalSessions, workspaces } from "../db/schema";
import type { EventBus } from "../events";
import { portManager } from "../ports/port-manager";
import {
	type TerminalCommandRecord,
	TerminalCommandRecordManager,
	type TerminalCommandSource,
} from "./command-records";
import {
	buildV2TerminalEnv,
	getShellLaunchArgs,
	getTerminalBaseEnv,
	resolveLaunchShell,
} from "./env";
import {
	clearInteractiveInputState,
	consumeInteractiveCommand,
	createInteractiveInputState,
	type InteractiveInputState,
	recordInteractiveInput,
} from "./interactive-input-tracker";

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
	| {
			type: "runCommand";
			command: string;
			commandId?: string;
			source?: Extract<TerminalCommandSource, "agent" | "system">;
	  }
	| { type: "resize"; cols: number; rows: number }
	| { type: "dispose" };

type TerminalServerMessage =
	| { type: "data"; data: string }
	| { type: "error"; message: string }
	| { type: "exit"; exitCode: number; signal: number }
	| { type: "replay"; data: string }
	| { type: "title"; title: string | null }
	| { type: "commandRecordsSnapshot"; records: TerminalCommandRecord[] }
	| { type: "commandRecordStarted"; record: TerminalCommandRecord }
	| { type: "commandRecordUpdated"; record: TerminalCommandRecord }
	| { type: "commandRecordFinished"; record: TerminalCommandRecord };

const MAX_BUFFER_BYTES = 64 * 1024;
const COMMAND_RECORD_SNAPSHOT_LIMIT = 50;
const COMMAND_RECORD_SNAPSHOT_OUTPUT_CHARS = 16_384;
const PENDING_RUN_COMMAND_LIMIT = 20;
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

interface PendingTrackedCommand {
	command: string;
	commandId?: string;
	source: Exclude<TerminalCommandSource, "user">;
}

interface TerminalSession {
	terminalId: string;
	workspaceId: string;
	cwd: string;
	pty: IPty;
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
	commandScanState: TerminalCommandScanState;
	commandRecords: TerminalCommandRecordManager;
	commandMarkersEnabled: boolean;
	promptReady: boolean;
	pendingCommands: PendingTrackedCommand[];
	interactiveInputState: InteractiveInputState;

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

export function listTerminalCommandRecords(options: {
	workspaceId: string;
	terminalId: string;
	limit?: number;
}): TerminalCommandRecord[] {
	const session = sessions.get(options.terminalId);
	if (!session || session.workspaceId !== options.workspaceId) return [];
	return session.commandRecords.listRecords({ limit: options.limit });
}

export function getTerminalCommandRecord(options: {
	workspaceId: string;
	terminalId: string;
	recordId: string;
}): TerminalCommandRecord | null {
	const session = sessions.get(options.terminalId);
	if (!session || session.workspaceId !== options.workspaceId) return null;
	return session.commandRecords.getRecord(options.recordId);
}

export function queueTerminalCommand(options: {
	workspaceId: string;
	terminalId: string;
	command: string;
	commandId?: string;
	source?: Extract<TerminalCommandSource, "agent" | "system">;
}): boolean {
	const session = sessions.get(options.terminalId);
	if (
		!session ||
		session.workspaceId !== options.workspaceId ||
		session.exited
	) {
		return false;
	}
	enqueueTrackedCommand(session, {
		command: options.command,
		commandId: options.commandId,
		source: options.source ?? "system",
	});
	return true;
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

function sendCommandRecordsSnapshot(
	session: TerminalSession,
	socket: { send: (data: string) => void; readyState: number },
) {
	sendMessage(socket, {
		type: "commandRecordsSnapshot",
		records: session.commandRecords
			.listRecords({ limit: COMMAND_RECORD_SNAPSHOT_LIMIT })
			.map(compactRecordForSnapshot),
	});
}

function compactTextForSnapshot(value: string): string {
	const chars = Array.from(value);
	if (chars.length <= COMMAND_RECORD_SNAPSHOT_OUTPUT_CHARS) return value;
	return chars.slice(0, COMMAND_RECORD_SNAPSHOT_OUTPUT_CHARS).join("");
}

function compactRecordForSnapshot(
	record: TerminalCommandRecord,
): TerminalCommandRecord {
	return {
		...record,
		outputHead: compactTextForSnapshot(record.outputHead),
		outputTail: "",
	};
}

function handleCommandEvent(
	session: TerminalSession,
	event: TerminalCommandEvent,
): void {
	if (!session.commandMarkersEnabled) return;

	const now = Date.now();
	if (event.type === "commandStart") {
		session.promptReady = false;
		const record = session.commandRecords.startCommand({
			now,
			cwd: null,
			gitBranch: null,
			command:
				event.command ??
				consumeInteractiveCommand(session.interactiveInputState),
		});
		broadcastMessage(session, { type: "commandRecordStarted", record });
		return;
	}

	if (event.type === "commandFinish") {
		session.promptReady = false;
		const record = session.commandRecords.finishCommand({
			now,
			exitCode: event.exitCode,
		});
		if (record) {
			broadcastMessage(session, { type: "commandRecordFinished", record });
		}
		return;
	}

	session.promptReady = true;
	const record = session.commandRecords.finishActiveFromPrompt(now);
	if (record) {
		broadcastMessage(session, { type: "commandRecordFinished", record });
	}
	flushQueuedTrackedCommands(session);
}

function handleVisibleTerminalOutput(
	session: TerminalSession,
	data: string,
): void {
	if (data.length === 0) return;

	session.commandRecords.appendOutput(data);

	portManager.checkOutputForHint(data);

	if (broadcastMessage(session, { type: "data", data }) === 0) {
		bufferOutput(session, data);
	}
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
	if (state === "ready" && session.commandMarkersEnabled) {
		session.promptReady = true;
	} else if (state === "timed_out") {
		session.commandMarkersEnabled = false;
		session.promptReady = true;
		clearInteractiveInputState(session.interactiveInputState);
	}
	if (session.shellReadyResolve) {
		session.shellReadyResolve();
		session.shellReadyResolve = null;
	}
	flushQueuedTrackedCommands(session);
}

function queueInitialCommand(
	session: TerminalSession,
	initialCommand: string,
): void {
	if (session.initialCommandQueued) return;
	session.initialCommandQueued = true;
	enqueueTrackedCommand(session, {
		command: initialCommand,
		source: "initial-command",
	});
}

function writeTrackedCommand(
	session: TerminalSession,
	options: PendingTrackedCommand,
): void {
	if (session.exited) return;
	const command = options.command.endsWith("\n")
		? options.command
		: `${options.command}\n`;
	if (session.commandMarkersEnabled) {
		session.commandRecords.queueExpectedCommand({
			commandId: options.commandId,
			command: options.command,
			source: options.source,
		});
		session.pty.write(`\x15${command}`);
		session.promptReady = false;
		return;
	}

	session.pty.write(command);
}

function enqueueTrackedCommand(
	session: TerminalSession,
	command: PendingTrackedCommand,
): void {
	if (session.exited) return;
	session.pendingCommands.push(command);
	if (session.pendingCommands.length > PENDING_RUN_COMMAND_LIMIT) {
		const dropped = session.pendingCommands.shift();
		console.warn(
			`[terminal] dropped pending run command id=${dropped?.commandId ?? "unknown"} terminalId=${session.terminalId}`,
		);
	}
	session.shellReadyPromise.then(() => {
		flushQueuedTrackedCommands(session);
	});
}

function flushQueuedTrackedCommands(session: TerminalSession): void {
	if (session.exited || session.pendingCommands.length === 0) return;

	if (session.commandMarkersEnabled) {
		if (!session.promptReady) return;
		const next = session.pendingCommands.shift();
		if (next) writeTrackedCommand(session, next);
		return;
	}

	while (session.pendingCommands.length > 0) {
		const next = session.pendingCommands.shift();
		if (next) writeTrackedCommand(session, next);
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

export function createTerminalSessionInternal({
	terminalId,
	workspaceId,
	themeType,
	db,
	eventBus,
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
		hostAgentHookUrl: getHostAgentHookUrl(),
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
	const commandMarkersEnabled = shellName === "zsh" || shellName === "fish";
	if (!commandMarkersEnabled) {
		console.info(
			`[terminal] semantic command records require OSC 133;C/D markers; bundled wrappers currently support zsh/fish shell=${shellName}`,
		);
	}

	let shellReadyResolve: (() => void) | null = null;
	const shellReadyPromise = shellSupportsReady
		? new Promise<void>((resolve) => {
				shellReadyResolve = resolve;
			})
		: Promise.resolve();

	const session: TerminalSession = {
		terminalId,
		workspaceId,
		cwd,
		pty,
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
		commandScanState: createTerminalCommandScanState(),
		commandRecords: new TerminalCommandRecordManager({
			terminalId,
			workspaceId,
		}),
		commandMarkersEnabled,
		promptReady: !commandMarkersEnabled,
		pendingCommands: [],
		interactiveInputState: createInteractiveInputState(),
		shellReadyState: shellSupportsReady ? "pending" : "unsupported",
		shellReadyResolve,
		shellReadyPromise,
		shellReadyTimeoutId: null,
		scanState: createScanState(),
		initialCommandQueued: false,
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

	pty.onData((rawData) => {
		const titleUpdates = scanForTerminalTitle(session.titleScanState, rawData);
		for (const title of titleUpdates.updates) {
			setSessionTitle(session, title);
		}

		// Scan for initial OSC 133;A readiness and strip it from output.
		let data = rawData;
		if (session.shellReadyState === "pending") {
			const result = scanForShellReady(session.scanState, rawData);
			data = result.output;
			if (result.matched) {
				resolveShellReady(session, "ready");
			}
		}

		const commandScanResult = scanForTerminalCommandEvents(
			session.commandScanState,
			data,
		);
		for (const item of commandScanResult.items) {
			if (item.type === "event") {
				handleCommandEvent(session, item.event);
			} else {
				handleVisibleTerminalOutput(session, item.data);
			}
		}
	});

	pty.onExit(({ exitCode, signal }) => {
		session.exited = true;
		session.exitCode = exitCode ?? 0;
		session.exitSignal = signal ?? 0;

		portManager.unregisterSession(terminalId);
		const finishedRecord = session.commandRecords.handlePtyExit(Date.now());
		if (finishedRecord) {
			broadcastMessage(session, {
				type: "commandRecordFinished",
				record: finishedRecord,
			});
		}

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
	});

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

		const result = createTerminalSessionInternal({
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
						const result = createTerminalSessionInternal({
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

						result.sockets.add(ws);
						sendMessage(ws, { type: "title", title: result.title });
						sendCommandRecordsSnapshot(result, ws);

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

					sendMessage(ws, { type: "title", title: existing.title });
					sendCommandRecordsSnapshot(existing, ws);
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
						if (session.commandMarkersEnabled) {
							recordInteractiveInput(
								session.interactiveInputState,
								message.data,
							);
						}
						session.pty.write(message.data);
						return;
					}

					if (message.type === "initialCommand") {
						queueInitialCommand(session, message.data);
						return;
					}

					if (message.type === "runCommand") {
						enqueueTrackedCommand(session, {
							command: message.command,
							commandId: message.commandId,
							source: message.source === "agent" ? "agent" : "system",
						});
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
