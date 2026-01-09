/**
 * PTY Subprocess
 *
 * This runs as a completely separate process, owning a single PTY.
 * Process isolation guarantees that a blocked PTY won't stall the daemon.
 *
 * Communication via stdin/stdout using a small binary framing protocol
 * to avoid JSON escaping overhead on escape-sequence-heavy PTY output.
 */

import { write as fsWrite } from "node:fs";
import type { IPty } from "node-pty";
import * as pty from "node-pty";
import {
	PtySubprocessFrameDecoder,
	PtySubprocessIpcType,
	writeFrame,
} from "./pty-subprocess-ipc";

// =============================================================================
// Types (kept local to avoid bundling/import surprises)
// =============================================================================

interface SpawnPayload {
	shell: string;
	args: string[];
	cwd: string;
	cols: number;
	rows: number;
	env: Record<string, string>;
}

// =============================================================================
// State
// =============================================================================

let ptyProcess: IPty | null = null;
let ptyFd: number | null = null;

// Write queue for stdin (uses async fs.write on the PTY fd to avoid blocking the event loop)
const writeQueue: Buffer[] = [];
let queuedBytes = 0;
let flushing = false;
let writeBackoffMs = 0;
const MIN_WRITE_BACKOFF_MS = 2;
const MAX_WRITE_BACKOFF_MS = 50;

let stdinPaused = false;
const INPUT_QUEUE_HIGH_WATERMARK_BYTES = 8 * 1024 * 1024; // 8MB
const INPUT_QUEUE_LOW_WATERMARK_BYTES = 4 * 1024 * 1024; // 4MB
// Hard cap to avoid runaway memory usage if upstream misbehaves.
const INPUT_QUEUE_HARD_LIMIT_BYTES = 64 * 1024 * 1024; // 64MB

// Output batching - collect PTY output and send periodically.
// CRITICAL: Use array buffering to avoid O(n²) string concatenation.
let outputChunks: string[] = [];
let outputBytesQueued = 0;
let outputFlushScheduled = false;
const OUTPUT_FLUSH_INTERVAL_MS = 32; // ~30 fps max
const MAX_OUTPUT_BATCH_SIZE_BYTES = 128 * 1024; // 128KB max per flush

// Backpressure - track if stdout is draining
let stdoutDraining = true;
let ptyPaused = false;

const DEBUG_OUTPUT_BATCHING = process.env.SUPERSET_PTY_SUBPROCESS_DEBUG === "1";

// =============================================================================
// Helpers
// =============================================================================

function send(type: PtySubprocessIpcType, payload?: Buffer): void {
	stdoutDraining = writeFrame(process.stdout, type, payload);

	// If stdout buffer is full, pause PTY reads (reduces runaway buffering/CPU).
	if (!stdoutDraining && ptyProcess && !ptyPaused) {
		ptyPaused = true;
		ptyProcess.pause();
	}
}

process.stdout.on("drain", () => {
	stdoutDraining = true;
	if (ptyPaused && ptyProcess) {
		ptyPaused = false;
		ptyProcess.resume();
	}
});

function sendError(message: string): void {
	send(PtySubprocessIpcType.Error, Buffer.from(message, "utf8"));
}

/**
 * Queue PTY output for batched sending.
 * Flushes immediately if batch exceeds MAX_OUTPUT_BATCH_SIZE_BYTES.
 */
function queueOutput(data: string): void {
	outputChunks.push(data);
	outputBytesQueued += Buffer.byteLength(data, "utf8");

	if (outputBytesQueued >= MAX_OUTPUT_BATCH_SIZE_BYTES) {
		outputFlushScheduled = false;
		flushOutput();
		return;
	}

	if (!outputFlushScheduled) {
		outputFlushScheduled = true;
		setTimeout(flushOutput, OUTPUT_FLUSH_INTERVAL_MS);
	}
}

function flushOutput(): void {
	outputFlushScheduled = false;
	if (outputChunks.length === 0) return;

	const data = outputChunks.join("");
	const chunkCount = outputChunks.length;
	outputChunks = [];
	outputBytesQueued = 0;

	const payload = Buffer.from(data, "utf8");

	if (DEBUG_OUTPUT_BATCHING) {
		console.error(
			`[pty-subprocess] Flushing ${payload.length} bytes (${chunkCount} chunks batched)`,
		);
	}

	send(PtySubprocessIpcType.Data, payload);
}

function maybePauseStdin(): void {
	if (stdinPaused) return;
	if (queuedBytes < INPUT_QUEUE_HIGH_WATERMARK_BYTES) return;

	stdinPaused = true;
	process.stdin.pause();
}

function maybeResumeStdin(): void {
	if (!stdinPaused) return;
	if (queuedBytes > INPUT_QUEUE_LOW_WATERMARK_BYTES) return;

	stdinPaused = false;
	process.stdin.resume();
}

function queueWriteBuffer(buf: Buffer): void {
	if (queuedBytes + buf.length > INPUT_QUEUE_HARD_LIMIT_BYTES) {
		// This should never happen for normal pastes; avoid OOM if it does.
		sendError("Input backlog exceeded hard limit");
		return;
	}

	writeQueue.push(buf);
	queuedBytes += buf.length;
	maybePauseStdin();
	scheduleFlush();
}

function scheduleFlush(): void {
	if (flushing) return;
	flushing = true;
	setImmediate(flush);
}

function flush(): void {
	if (!ptyProcess || writeQueue.length === 0) {
		flushing = false;
		return;
	}

	// If we can access the PTY fd, use async fs.write to avoid blocking the JS event loop.
	if (typeof ptyFd === "number" && ptyFd > 0) {
		const buf = writeQueue[0];

		fsWrite(ptyFd, buf, 0, buf.length, null, (err, bytesWritten) => {
			if (err) {
				const code = (err as NodeJS.ErrnoException).code;
				// PTY fds are often non-blocking. If the kernel buffer is full,
				// writes can fail with EAGAIN/EWOULDBLOCK. This is normal backpressure;
				// retry later instead of dropping the paste.
				if (code === "EAGAIN" || code === "EWOULDBLOCK") {
					writeBackoffMs =
						writeBackoffMs === 0
							? MIN_WRITE_BACKOFF_MS
							: Math.min(writeBackoffMs * 2, MAX_WRITE_BACKOFF_MS);
					if (
						DEBUG_OUTPUT_BATCHING &&
						writeBackoffMs === MIN_WRITE_BACKOFF_MS
					) {
						console.error("[pty-subprocess] PTY input backpressured (EAGAIN)");
					}
					setTimeout(flush, writeBackoffMs);
					return;
				}

				sendError(
					`Write failed: ${err instanceof Error ? err.message : String(err)}`,
				);
				writeQueue.length = 0;
				queuedBytes = 0;
				flushing = false;
				return;
			}

			const wrote = Math.max(0, bytesWritten ?? 0);
			writeBackoffMs = 0;
			queuedBytes -= wrote;

			if (wrote >= buf.length) {
				writeQueue.shift();
			} else {
				writeQueue[0] = buf.subarray(wrote);
			}

			maybeResumeStdin();

			if (writeQueue.length > 0) {
				setImmediate(flush);
			} else {
				flushing = false;
			}
		});
		return;
	}

	// Fallback: node-pty's write() is synchronous and can block.
	// This path should rarely be used on macOS, but keep it for safety.
	const chunk = writeQueue.shift();
	if (!chunk) {
		flushing = false;
		return;
	}

	queuedBytes -= chunk.length;
	maybeResumeStdin();

	try {
		ptyProcess.write(chunk.toString("utf8"));
	} catch (error) {
		sendError(
			`Write failed: ${error instanceof Error ? error.message : String(error)}`,
		);
		writeQueue.length = 0;
		queuedBytes = 0;
		flushing = false;
		return;
	}

	if (writeQueue.length > 0) {
		setImmediate(flush);
		return;
	}

	flushing = false;
}

// =============================================================================
// Message Handlers
// =============================================================================

function handleSpawn(payload: Buffer): void {
	if (ptyProcess) {
		sendError("PTY already spawned");
		return;
	}

	let msg: SpawnPayload;
	try {
		msg = JSON.parse(payload.toString("utf8")) as SpawnPayload;
	} catch (error) {
		sendError(
			`Spawn payload parse failed: ${error instanceof Error ? error.message : String(error)}`,
		);
		return;
	}

	if (DEBUG_OUTPUT_BATCHING) {
		// Debug: Log spawn parameters
		console.error("[pty-subprocess] Spawning PTY:", {
			shell: msg.shell,
			args: msg.args,
			cwd: msg.cwd,
			cols: msg.cols,
			rows: msg.rows,
			ZDOTDIR: msg.env.ZDOTDIR,
			SUPERSET_ORIG_ZDOTDIR: msg.env.SUPERSET_ORIG_ZDOTDIR,
			PATH_start: msg.env.PATH?.substring(0, 100),
		});
	}

	try {
		ptyProcess = pty.spawn(msg.shell, msg.args, {
			name: "xterm-256color",
			cols: msg.cols,
			rows: msg.rows,
			cwd: msg.cwd,
			env: msg.env,
		});

		ptyFd = (ptyProcess as unknown as { fd?: number }).fd ?? null;
		if (DEBUG_OUTPUT_BATCHING) {
			console.error(
				`[pty-subprocess] PTY fd ${ptyFd ?? "unknown"} (${typeof ptyFd === "number" ? "async fs.write enabled" : "falling back to pty.write"})`,
			);
		}

		ptyProcess.onData((data) => {
			queueOutput(data);
		});

		ptyProcess.onExit(({ exitCode, signal }) => {
			flushOutput();

			const exitPayload = Buffer.allocUnsafe(8);
			exitPayload.writeInt32LE(exitCode ?? 0, 0);
			exitPayload.writeInt32LE(signal ?? 0, 4);
			send(PtySubprocessIpcType.Exit, exitPayload);

			ptyProcess = null;
			ptyFd = null;
			setTimeout(() => {
				process.exit(0);
			}, 100);
		});

		const pidPayload = Buffer.allocUnsafe(4);
		pidPayload.writeUInt32LE(ptyProcess.pid ?? 0, 0);
		send(PtySubprocessIpcType.Spawned, pidPayload);
	} catch (error) {
		sendError(
			`Spawn failed: ${error instanceof Error ? error.message : String(error)}`,
		);
	}
}

function handleWrite(payload: Buffer): void {
	if (!ptyProcess) {
		sendError("PTY not spawned");
		return;
	}

	queueWriteBuffer(payload);
}

function handleResize(payload: Buffer): void {
	if (!ptyProcess) return;
	if (payload.length < 8) return;
	try {
		const cols = payload.readUInt32LE(0);
		const rows = payload.readUInt32LE(4);
		ptyProcess.resize(cols, rows);
	} catch {
		// Ignore resize errors
	}
}

function handleKill(payload: Buffer): void {
	const signal = payload.length > 0 ? payload.toString("utf8") : "SIGTERM";

	if (!ptyProcess) {
		return;
	}

	const pid = ptyProcess.pid;

	// Step 1: Send the requested signal (usually SIGTERM for graceful shutdown)
	try {
		ptyProcess.kill(signal);
	} catch {
		// Process may already be dead
	}

	// Step 2: Escalate to SIGKILL if still alive after 2 seconds
	// node-pty's onExit callback may not fire reliably after pty.kill()
	const escalationTimer = setTimeout(() => {
		if (!ptyProcess) return; // Already exited via onExit

		try {
			ptyProcess.kill("SIGKILL");
		} catch {
			// Process may already be dead
		}

		// Step 3: Force completion if onExit still hasn't fired after another 1 second
		// This ensures the subprocess exits even if node-pty never emits onExit
		const forceExitTimer = setTimeout(() => {
			if (!ptyProcess) return; // Finally exited via onExit

			console.error(
				`[pty-subprocess] Force exit: onExit never fired for pid ${pid}`,
			);

			// Synthesize Exit frame since onExit won't fire
			const exitPayload = Buffer.allocUnsafe(8);
			exitPayload.writeInt32LE(-1, 0); // Unknown exit code
			exitPayload.writeInt32LE(9, 4); // SIGKILL signal number
			send(PtySubprocessIpcType.Exit, exitPayload);

			ptyProcess = null;
			ptyFd = null;
			process.exit(0);
		}, 1000);
		forceExitTimer.unref();
	}, 2000);
	escalationTimer.unref();
}

/**
 * Send a signal to the PTY process without escalation.
 * Unlike handleKill, this does not escalate to SIGKILL or force exit.
 * Used for signals like SIGINT (Ctrl+C) where the process should continue running.
 */
function handleSignal(payload: Buffer): void {
	const signal = payload.length > 0 ? payload.toString("utf8") : "SIGINT";

	if (!ptyProcess) {
		return;
	}

	try {
		ptyProcess.kill(signal);
	} catch {
		// Process may already be dead
	}
}

function handleDispose(): void {
	flushOutput();

	writeQueue.length = 0;
	queuedBytes = 0;
	flushing = false;
	outputChunks = [];
	outputBytesQueued = 0;
	outputFlushScheduled = false;
	ptyFd = null;

	if (ptyProcess) {
		try {
			ptyProcess.kill("SIGKILL");
		} catch {
			// Ignore
		}
		ptyProcess = null;
	}

	process.exit(0);
}

// =============================================================================
// Main
// =============================================================================

const decoder = new PtySubprocessFrameDecoder();

process.stdin.on("data", (chunk: Buffer) => {
	try {
		const frames = decoder.push(chunk);
		for (const frame of frames) {
			switch (frame.type) {
				case PtySubprocessIpcType.Spawn:
					handleSpawn(frame.payload);
					break;
				case PtySubprocessIpcType.Write:
					handleWrite(frame.payload);
					break;
				case PtySubprocessIpcType.Resize:
					handleResize(frame.payload);
					break;
				case PtySubprocessIpcType.Kill:
					handleKill(frame.payload);
					break;
				case PtySubprocessIpcType.Signal:
					handleSignal(frame.payload);
					break;
				case PtySubprocessIpcType.Dispose:
					handleDispose();
					break;
			}
		}
	} catch (error) {
		sendError(
			`Failed to parse frame: ${error instanceof Error ? error.message : String(error)}`,
		);
	}
});

process.stdin.on("end", () => {
	handleDispose();
});

send(PtySubprocessIpcType.Ready);
