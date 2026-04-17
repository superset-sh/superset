import { type ChildProcess, spawn } from "node:child_process";
import type { Socket } from "node:net";
import {
	type ClientToServerStreamFrame,
	ClientToServerStreamFrameSchema,
	type ServerToClientStreamFrame,
} from "../types";

export interface SpawnPtySubprocessHandlerOptions {
	/** Path to the JS file to spawn with Electron-as-Node. Usually pty-subprocess.js. */
	subprocessScriptPath: string;
	/** Path to node/electron binary to invoke. Defaults to process.execPath. */
	nodeBinaryPath?: string;
	/**
	 * Time in ms to wait for a graceful SIGTERM exit before escalating to
	 * SIGKILL when the client disconnects. Defaults to 2000ms.
	 */
	hardKillGraceMs?: number;
	/**
	 * Bytes that were already read off the socket by the caller after the
	 * initial request line — e.g. if the client pipelined a stdin frame in
	 * the same TCP chunk as the auth handshake. These bytes are prepended to
	 * the handler's internal buffer so they are parsed as the first incoming
	 * frames.
	 */
	initialBuffer?: string;
}

export interface SpawnPtySubprocessRequest {
	env: Record<string, string>;
}

export interface SpawnPtySubprocessHandle {
	pid: number;
	/**
	 * Register a callback to fire once both the child has exited AND the
	 * socket has closed. If the session has already finished, the callback
	 * runs immediately.
	 */
	onClosed(callback: () => void): void;
}

const DEFAULT_HARD_KILL_GRACE_MS = 2000;

/**
 * Spawn a fresh child (pty-subprocess.js) in Electron main's fresh Mach context,
 * and forward I/O bidirectionally over the provided UDS client socket as NDJSON
 * StreamFrames. The handler takes ownership of the socket: the caller must not
 * write to it or close it after invoking this handler.
 *
 * Protocol on the socket after this handler is invoked:
 *   1. First line: {type:"ok", pid} — the initial SpawnResponse.
 *   2. Subsequent lines (server→client): ServerToClientStreamFrame NDJSON
 *      (stdout/stderr/exit).
 *   3. Subsequent lines (client→server): ClientToServerStreamFrame NDJSON
 *      (stdin/resize/signal). `resize` is ignored for this non-PTY handler;
 *      Task 13's fresh-exec handler will honor it.
 *
 * Lifecycle:
 *   - Child exit → emit {type:"exit"} frame, half-close the socket, finalize.
 *   - Client disconnect → SIGTERM the child; escalate to SIGKILL after
 *     `hardKillGraceMs` (default 2s) if the child is still alive.
 */
export function handleSpawnPtySubprocess(
	request: SpawnPtySubprocessRequest,
	client: Socket,
	options: SpawnPtySubprocessHandlerOptions,
): SpawnPtySubprocessHandle {
	const binaryPath = options.nodeBinaryPath ?? process.execPath;
	const hardKillGraceMs = options.hardKillGraceMs ?? DEFAULT_HARD_KILL_GRACE_MS;

	const child: ChildProcess = spawn(
		binaryPath,
		[options.subprocessScriptPath],
		{
			stdio: ["pipe", "pipe", "pipe"],
			env: {
				...request.env,
				ELECTRON_RUN_AS_NODE: "1",
			},
		},
	);

	if (!child.stdin || !child.stdout || !child.stderr || child.pid == null) {
		child.kill("SIGKILL");
		throw new Error("failed to spawn subprocess");
	}

	const pid = child.pid;
	const closedCallbacks: Array<() => void> = [];
	let childExited = false;
	let socketClosed = false;
	let finalized = false;

	const tryFinalize = (): void => {
		if (!childExited || !socketClosed || finalized) return;
		finalized = true;
		for (const cb of closedCallbacks) {
			try {
				cb();
			} catch {
				// ignore callback errors — lifecycle must complete
			}
		}
	};

	// Write ok response as the first streamed line. Note: this frame is the
	// SpawnResponse schema, NOT a StreamFrame. The client must parse the first
	// line as SpawnResponse and all subsequent lines as StreamFrames.
	writeRawLine(client, { type: "ok", pid });

	// Disable idle timeout — streaming sessions can be long-lived. The server's
	// handshake timeout was only meant to protect against half-open handshakes,
	// not to limit session duration.
	client.setTimeout(0);

	// ======================================================================
	// Server -> client direction (child stdout/stderr/exit -> UDS frames)
	// ======================================================================

	child.stdout.on("data", (chunk: Buffer) => {
		writeFrame(client, {
			type: "stdout",
			data: chunk.toString("base64"),
		});
	});

	child.stderr.on("data", (chunk: Buffer) => {
		writeFrame(client, {
			type: "stderr",
			data: chunk.toString("base64"),
		});
	});

	child.once("exit", (code, signal) => {
		childExited = true;
		writeFrame(client, {
			type: "exit",
			code: code ?? null,
			signal: signal ?? null,
		});
		// Half-close: signal end-of-stream, let client flush its read side.
		try {
			client.end();
		} catch {
			// already gone
		}
		tryFinalize();
	});

	// ======================================================================
	// Client -> server direction (UDS frames -> child stdin / signals)
	// ======================================================================

	let buffer = options.initialBuffer ?? "";
	const drainBuffer = (): void => {
		let newlineIdx: number;
		// biome-ignore lint/suspicious/noAssignInExpressions: standard NDJSON line extractor
		while ((newlineIdx = buffer.indexOf("\n")) !== -1) {
			const line = buffer.slice(0, newlineIdx);
			buffer = buffer.slice(newlineIdx + 1);
			handleIncomingFrame(line, child);
		}
	};
	// Drain any pipelined frames the caller already read off the socket.
	drainBuffer();
	client.on("data", (chunk: Buffer) => {
		buffer += chunk.toString("utf8");
		drainBuffer();
	});

	client.on("close", () => {
		socketClosed = true;
		if (!childExited) {
			try {
				child.kill("SIGTERM");
			} catch {
				// may already be dead
			}
			// Hard kill after grace period if still alive.
			setTimeout(() => {
				if (!childExited) {
					try {
						child.kill("SIGKILL");
					} catch {
						// ignore
					}
				}
			}, hardKillGraceMs).unref();
		}
		tryFinalize();
	});

	client.on("error", () => {
		// The 'close' handler will still fire; no action needed here. Swallowing
		// the error prevents it from surfacing as an unhandled error event.
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

function writeRawLine(
	client: Socket,
	frame: { type: "ok"; pid: number },
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

function handleIncomingFrame(line: string, child: ChildProcess): void {
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
			if (child.stdin && !child.stdin.destroyed) {
				try {
					child.stdin.write(Buffer.from(frame.data, "base64"));
				} catch {
					// ignore — stdin may have closed between the check and write
				}
			}
			return;
		case "signal":
			try {
				child.kill(frame.name as NodeJS.Signals);
			} catch {
				// ignore invalid signal
			}
			return;
		case "resize":
			// No-op for non-PTY subprocess. Task 13's fresh-exec handler uses
			// resize to forward SIGWINCH geometry updates to the PTY master.
			return;
	}
}
