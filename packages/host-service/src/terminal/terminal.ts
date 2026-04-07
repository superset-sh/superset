import { existsSync } from "node:fs";
import type { NodeWebSocket } from "@hono/node-ws";
import { eq } from "drizzle-orm";
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

function parseThemeType(
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

interface TerminalSession {
	terminalId: string;
	pty: IPty;
	socket: {
		send: (data: string) => void;
		close: (code?: number, reason?: string) => void;
		readyState: number;
	} | null;
	buffer: string[];
	bufferBytes: number;
	exited: boolean;
	exitCode: number;
	exitSignal: number;
}

/** PTY lifetime is independent of socket lifetime — sockets detach/reattach freely. */
const sessions = new Map<string, TerminalSession>();

function sendMessage(
	socket: { send: (data: string) => void; readyState: number },
	message: TerminalServerMessage,
) {
	if (socket.readyState !== 1) return;
	socket.send(JSON.stringify(message));
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

function disposeSession(terminalId: string, db: HostDb) {
	const session = sessions.get(terminalId);
	if (!session) return;

	if (!session.exited) {
		try {
			session.pty.kill();
		} catch {
			// PTY may already be dead
		}
	}
	sessions.delete(terminalId);

	db.update(terminalSessions)
		.set({ status: "disposed", endedAt: Date.now() })
		.where(eq(terminalSessions.id, terminalId))
		.run();
}

interface CreateTerminalSessionOptions {
	terminalId: string;
	workspaceId: string;
	themeType?: "dark" | "light";
	db: HostDb;
}

function createTerminalSessionInternal({
	terminalId,
	workspaceId,
	themeType,
	db,
}: CreateTerminalSessionOptions): TerminalSession | { error: string } {
	const existing = sessions.get(terminalId);
	if (existing) {
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

	db.insert(terminalSessions)
		.values({
			id: terminalId,
			originWorkspaceId: workspaceId,
			status: "active",
		})
		.onConflictDoUpdate({
			target: terminalSessions.id,
			set: { status: "active", endedAt: null },
		})
		.run();

	const session: TerminalSession = {
		terminalId,
		pty,
		socket: null,
		buffer: [],
		bufferBytes: 0,
		exited: false,
		exitCode: 0,
		exitSignal: 0,
	};
	sessions.set(terminalId, session);

	pty.onData((data) => {
		if (session.socket?.readyState === 1) {
			sendMessage(session.socket, { type: "data", data });
		} else {
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

		if (session.socket?.readyState === 1) {
			sendMessage(session.socket, {
				type: "exit",
				exitCode: session.exitCode,
				signal: session.exitSignal,
			});
		}
	});

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
		const result = Array.from(sessions.values()).map((s) => ({
			terminalId: s.terminalId,
			exited: s.exited,
			exitCode: s.exitCode,
			attached: s.socket !== null,
		}));
		return c.json({ sessions: result });
	});

	app.get(
		"/terminal/:terminalId",
		upgradeWebSocket((c) => {
			const terminalId = c.req.param("terminalId") ?? "";
			const workspaceId = c.req.query("workspaceId") ?? null;
			const themeType = parseThemeType(c.req.query("themeType"));

			return {
				onOpen: (_event, ws) => {
					if (!terminalId) {
						ws.close(1011, "Missing terminalId");
						return;
					}

					const existing = sessions.get(terminalId);
					if (existing) {
						if (existing.socket && existing.socket !== ws) {
							existing.socket.close(4000, "Displaced by new connection");
						}
						existing.socket = ws;

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
						return;
					}

					if (!workspaceId) {
						sendMessage(ws, {
							type: "error",
							message: "Missing workspaceId for new terminal session",
						});
						ws.close(1011, "Missing workspaceId");
						return;
					}

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

					result.socket = ws;

					db.update(terminalSessions)
						.set({ lastAttachedAt: Date.now() })
						.where(eq(terminalSessions.id, terminalId))
						.run();
				},

				onMessage: (event, ws) => {
					const session = sessions.get(terminalId ?? "");
					if (!session || session.socket !== ws) return;

					let message: TerminalClientMessage;
					try {
						message = JSON.parse(String(event.data)) as TerminalClientMessage;
					} catch {
						if (session.socket) {
							sendMessage(session.socket, {
								type: "error",
								message: "Invalid terminal message payload",
							});
						}
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
					if (session?.socket === ws) {
						session.socket = null;
					}
				},

				onError: (_event, ws) => {
					const session = sessions.get(terminalId ?? "");
					if (session?.socket === ws) {
						session.socket = null;
					}
				},
			};
		}),
	);
}
