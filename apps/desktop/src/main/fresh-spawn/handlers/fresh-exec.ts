import type { Socket } from "node:net";
import type { IPty } from "node-pty";
import * as pty from "node-pty";
import {
	type ClientToServerStreamFrame,
	ClientToServerStreamFrameSchema,
	type ServerToClientStreamFrame,
} from "../types";

export interface FreshExecRequest {
	command: string;
	args: string[];
	cwd: string;
	env: Record<string, string>;
	ptyCols: number;
	ptyRows: number;
}

export interface FreshExecHandlerOptions {
	/**
	 * Time in ms to wait for a graceful SIGTERM exit before escalating to
	 * SIGKILL when the client disconnects. Defaults to 2000ms.
	 */
	hardKillGraceMs?: number;
	/**
	 * Bytes already read off the socket after the initial request line — e.g.
	 * pipelined stdin frames. Prepended to the handler's NDJSON parser so they
	 * are processed as the first incoming frames.
	 */
	initialBuffer?: string;
}

export interface FreshExecHandle {
	pid: number;
	/**
	 * Register a callback that fires once both the PTY has exited AND the
	 * socket has closed. If the session has already finished, the callback
	 * runs immediately.
	 */
	onClosed(callback: () => void): void;
}

const DEFAULT_HARD_KILL_GRACE_MS = 2000;

/**
 * Run an arbitrary command inside a fresh PTY and forward its I/O over the
 * provided UDS client socket as NDJSON StreamFrames. The handler takes
 * ownership of the socket: the caller must not write to it or close it.
 *
 * Unlike spawn-pty-subprocess (which spawns our internal pty-subprocess.js via
 * child_process.spawn without a real tty), this handler uses node-pty to
 * allocate a pseudoterminal — which is what interactive commands like
 * `gh auth login` need. Resize frames from the client are honored here.
 *
 * Protocol on the socket after invocation:
 *   1. First line: {type:"ok", pid} — the initial SpawnResponse.
 *   2. server→client: ServerToClientStreamFrame NDJSON (stdout/exit).
 *      Note: PTY master merges stdout/stderr into one stream, so everything
 *      is framed as `stdout`.
 *   3. client→server: ClientToServerStreamFrame NDJSON
 *      (stdin/resize/signal).
 *
 * Lifecycle:
 *   - PTY exit → emit {type:"exit"} frame, half-close the socket, finalize.
 *   - Client disconnect → SIGTERM the PTY; escalate to SIGKILL after
 *     `hardKillGraceMs` (default 2s) if still alive.
 */
export function handleFreshExec(
	request: FreshExecRequest,
	client: Socket,
	options: FreshExecHandlerOptions = {},
): FreshExecHandle {
	const hardKillGraceMs = options.hardKillGraceMs ?? DEFAULT_HARD_KILL_GRACE_MS;

	let ptyProcess: IPty;
	try {
		ptyProcess = pty.spawn(request.command, request.args, {
			name: "xterm-256color",
			cols: request.ptyCols,
			rows: request.ptyRows,
			cwd: request.cwd,
			env: request.env,
		});
	} catch (err) {
		// Surface spawn failure as a one-shot error response (SpawnResponse
		// shape, not a StreamFrame) so the client sees the same error format
		// as other handshake-time failures. Then close the socket.
		writeHandshakeLine(client, {
			type: "error",
			message: `fresh-exec spawn failed: ${err instanceof Error ? err.message : String(err)}`,
			code: "E_SPAWN",
		});
		try {
			client.end();
		} catch {
			// ignore
		}
		return {
			pid: -1,
			onClosed(callback) {
				try {
					callback();
				} catch {
					// ignore
				}
			},
		};
	}

	const pid = ptyProcess.pid;
	const closedCallbacks: Array<() => void> = [];
	let ptyExited = false;
	let socketClosed = false;
	let finalized = false;

	const tryFinalize = (): void => {
		if (!ptyExited || !socketClosed || finalized) return;
		finalized = true;
		for (const cb of closedCallbacks) {
			try {
				cb();
			} catch {
				// ignore callback errors
			}
		}
	};

	// Initial ok response (SpawnResponse shape, not a StreamFrame).
	writeHandshakeLine(client, { type: "ok", pid });

	// Disable idle timeout — streaming sessions can be long-lived. The server's
	// handshake idle timeout only protects against half-open handshakes.
	client.setTimeout(0);

	// =====================================================================
	// PTY → client (onData merges stdout+stderr; frame as "stdout")
	// =====================================================================

	ptyProcess.onData((chunk: string) => {
		writeFrame(client, {
			type: "stdout",
			data: Buffer.from(chunk, "utf8").toString("base64"),
		});
	});

	ptyProcess.onExit(({ exitCode, signal }) => {
		ptyExited = true;
		writeFrame(client, {
			type: "exit",
			code: typeof exitCode === "number" ? exitCode : null,
			// node-pty reports the signal as a number on POSIX; convert to a
			// string to satisfy the schema. Undefined (normal exit) → null.
			signal: typeof signal === "number" ? String(signal) : null,
		});
		try {
			client.end();
		} catch {
			// socket may already be gone
		}
		tryFinalize();
	});

	// =====================================================================
	// Client → PTY
	// =====================================================================

	let buffer = options.initialBuffer ?? "";
	const drainBuffer = (): void => {
		let newlineIdx: number;
		// biome-ignore lint/suspicious/noAssignInExpressions: NDJSON line extractor
		while ((newlineIdx = buffer.indexOf("\n")) !== -1) {
			const line = buffer.slice(0, newlineIdx);
			buffer = buffer.slice(newlineIdx + 1);
			handleIncomingFrame(line, ptyProcess);
		}
	};
	// Drain any pipelined frames first.
	drainBuffer();

	client.on("data", (chunk: Buffer) => {
		buffer += chunk.toString("utf8");
		drainBuffer();
	});

	client.on("close", () => {
		socketClosed = true;
		if (!ptyExited) {
			try {
				ptyProcess.kill("SIGTERM");
			} catch {
				// may already be dead
			}
			setTimeout(() => {
				if (!ptyExited) {
					try {
						ptyProcess.kill("SIGKILL");
					} catch {
						// ignore
					}
				}
			}, hardKillGraceMs).unref();
		}
		tryFinalize();
	});

	client.on("error", () => {
		// 'close' will still fire; swallow here to avoid unhandled errors.
	});

	return {
		pid,
		onClosed(callback) {
			closedCallbacks.push(callback);
			if (finalized) {
				try {
					callback();
				} catch {
					// ignore
				}
			}
		},
	};
}

function writeHandshakeLine(
	client: Socket,
	frame:
		| { type: "ok"; pid: number }
		| { type: "error"; message: string; code: string },
): void {
	try {
		client.write(`${JSON.stringify(frame)}\n`);
	} catch {
		// socket may be destroyed; ignore
	}
}

function writeFrame(client: Socket, frame: ServerToClientStreamFrame): void {
	try {
		client.write(`${JSON.stringify(frame)}\n`);
	} catch {
		// socket may be destroyed; ignore
	}
}

function handleIncomingFrame(line: string, ptyProcess: IPty): void {
	if (line.trim().length === 0) return;
	let parsed: unknown;
	try {
		parsed = JSON.parse(line);
	} catch {
		return;
	}
	const result = ClientToServerStreamFrameSchema.safeParse(parsed);
	if (!result.success) return;

	const frame: ClientToServerStreamFrame = result.data;
	switch (frame.type) {
		case "stdin":
			try {
				ptyProcess.write(Buffer.from(frame.data, "base64").toString("utf8"));
			} catch {
				// ignore — PTY may have closed between check and write
			}
			return;
		case "signal":
			try {
				ptyProcess.kill(frame.name);
			} catch {
				// ignore invalid signal name or dead process
			}
			return;
		case "resize":
			try {
				ptyProcess.resize(frame.cols, frame.rows);
			} catch {
				// ignore if PTY has exited
			}
			return;
	}
}
