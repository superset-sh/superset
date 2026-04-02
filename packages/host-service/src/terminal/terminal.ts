import { existsSync } from "node:fs";
import { homedir } from "node:os";
import type { NodeWebSocket } from "@hono/node-ws";
import { eq } from "drizzle-orm";
import type { Hono } from "hono";
import { type IPty, spawn } from "node-pty";
import type { HostDb } from "../db";
import { workspaces } from "../db/schema";

interface RegisterWorkspaceTerminalRouteOptions {
	app: Hono;
	db: HostDb;
	upgradeWebSocket: NodeWebSocket["upgradeWebSocket"];
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
	paneId: string;
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

function resolveShell(): string {
	if (process.platform === "win32") {
		return process.env.COMSPEC || "cmd.exe";
	}
	return process.env.SHELL || "/bin/zsh";
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

function disposeSession(paneId: string) {
	const session = sessions.get(paneId);
	if (!session) return;

	if (!session.exited) {
		try {
			session.pty.kill();
		} catch {
			// PTY may already be dead
		}
	}
	sessions.delete(paneId);
}

export function registerWorkspaceTerminalRoute({
	app,
	db,
	upgradeWebSocket,
}: RegisterWorkspaceTerminalRouteOptions) {
	app.get(
		"/terminal/:paneId",
		upgradeWebSocket((c) => {
			const paneId = c.req.param("paneId");
			const workspaceId = c.req.query("workspaceId") ?? null;

			return {
				onOpen: (_event, ws) => {
					if (!paneId) {
						sendMessage(ws, {
							type: "error",
							message: "Missing paneId",
						});
						ws.close(1011, "Missing paneId");
						return;
					}

					const existing = sessions.get(paneId);
					if (existing) {
						if (existing.socket && existing.socket !== ws) {
							existing.socket.close(4000, "Displaced by new connection");
						}
						existing.socket = ws;
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

					const workspace = db.query.workspaces
						.findFirst({ where: eq(workspaces.id, workspaceId) })
						.sync();

					if (!workspace || !existsSync(workspace.worktreePath)) {
						sendMessage(ws, {
							type: "error",
							message: "Workspace worktree not found",
						});
						ws.close(1011, "Workspace worktree not found");
						return;
					}

					let pty: IPty;
					try {
						pty = spawn(resolveShell(), [], {
							name: "xterm-256color",
							cwd: workspace.worktreePath,
							cols: 120,
							rows: 32,
							env: {
								...process.env,
								TERM: "xterm-256color",
								COLORTERM: "truecolor",
								HOME: process.env.HOME || homedir(),
								PWD: workspace.worktreePath,
							},
						});
					} catch (error) {
						sendMessage(ws, {
							type: "error",
							message:
								error instanceof Error
									? error.message
									: "Failed to start terminal",
						});
						ws.close(1011, "Failed to start terminal");
						return;
					}

					const session: TerminalSession = {
						paneId,
						pty,
						socket: ws,
						buffer: [],
						bufferBytes: 0,
						exited: false,
						exitCode: 0,
						exitSignal: 0,
					};
					sessions.set(paneId, session);

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

						if (session.socket?.readyState === 1) {
							sendMessage(session.socket, {
								type: "exit",
								exitCode: session.exitCode,
								signal: session.exitSignal,
							});
						}
					});
				},

				onMessage: (event, ws) => {
					const session = sessions.get(paneId ?? "");
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
						disposeSession(paneId ?? "");
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
					const session = sessions.get(paneId ?? "");
					if (session?.socket === ws) {
						session.socket = null;
					}
				},

				onError: (_event, ws) => {
					const session = sessions.get(paneId ?? "");
					if (session?.socket === ws) {
						session.socket = null;
					}
				},
			};
		}),
	);
}
