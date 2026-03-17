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
	| {
			type: "input";
			data: string;
	  }
	| {
			type: "resize";
			cols: number;
			rows: number;
	  };

type TerminalServerMessage =
	| {
			type: "data";
			data: string;
	  }
	| {
			type: "error";
			message: string;
	  }
	| {
			type: "exit";
			exitCode: number;
			signal: number;
	  };

function sendMessage(
	socket: {
		send: (data: string) => void;
		readyState: number;
	},
	message: TerminalServerMessage,
) {
	if (socket.readyState !== 1) {
		return;
	}
	socket.send(JSON.stringify(message));
}

function resolveShell(): string {
	if (process.platform === "win32") {
		return process.env.COMSPEC || "cmd.exe";
	}

	return process.env.SHELL || "/bin/zsh";
}

export function registerWorkspaceTerminalRoute({
	app,
	db,
	upgradeWebSocket,
}: RegisterWorkspaceTerminalRouteOptions) {
	app.get(
		"/terminal/:workspaceId",
		upgradeWebSocket((c) => {
			const workspaceId = c.req.param("workspaceId");
			const workspace = db.query.workspaces
				.findFirst({ where: eq(workspaces.id, workspaceId) })
				.sync();

			let terminal: IPty | null = null;
			let disposed = false;

			const disposeTerminal = () => {
				if (disposed) {
					return;
				}
				disposed = true;
				terminal?.kill();
				terminal = null;
			};

			return {
				onOpen: (_event, ws) => {
					if (!workspace || !existsSync(workspace.worktreePath)) {
						sendMessage(ws, {
							type: "error",
							message: "Workspace worktree not found",
						});
						ws.close(1011, "Workspace worktree not found");
						return;
					}

					try {
						terminal = spawn(resolveShell(), [], {
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

					terminal.onData((data) => {
						sendMessage(ws, {
							type: "data",
							data,
						});
					});

					terminal.onExit(({ exitCode, signal }) => {
						sendMessage(ws, {
							type: "exit",
							exitCode: exitCode ?? 0,
							signal: signal ?? 0,
						});
						ws.close(1000, "Terminal exited");
						disposeTerminal();
					});
				},
				onMessage: (event, ws) => {
					if (!terminal) {
						return;
					}

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

					if (message.type === "input") {
						terminal.write(message.data);
						return;
					}

					if (message.type === "resize") {
						const cols = Math.max(20, Math.floor(message.cols));
						const rows = Math.max(5, Math.floor(message.rows));
						terminal.resize(cols, rows);
					}
				},
				onClose: () => {
					disposeTerminal();
				},
				onError: () => {
					disposeTerminal();
				},
			};
		}),
	);
}
