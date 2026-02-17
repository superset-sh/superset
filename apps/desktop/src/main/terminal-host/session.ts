/**
 * Terminal Host Session
 *
 * A session owns:
 * - A PTY subprocess (isolates blocking writes from main daemon)
 * - A HeadlessEmulator instance for state tracking
 * - A set of attached clients
 * - Output capture to disk
 */

import { type ChildProcess, spawn } from "node:child_process";
import type { Socket } from "node:net";
import * as path from "node:path";
import { buildSafeEnv } from "../lib/terminal/env";
import { HeadlessEmulator } from "../lib/terminal-host/headless-emulator";
import type {
	CreateOrAttachRequest,
	IpcEvent,
	SessionMeta,
	TerminalDataEvent,
	TerminalErrorEvent,
	TerminalExitEvent,
	TerminalSnapshot,
} from "../lib/terminal-host/types";
import { treeKillAsync } from "../lib/tree-kill";
import {
	createFrameHeader,
	PtySubprocessFrameDecoder,
	PtySubprocessIpcType,
} from "./pty-subprocess-ipc";

// =============================================================================
// Constants
// =============================================================================

/**
 * Timeout for flushing emulator writes during attach.
 * Prevents indefinite hang when continuous output (e.g., tail -f) keeps the queue non-empty.
 */
const ATTACH_FLUSH_TIMEOUT_MS = 500;

/**
 * Maximum bytes allowed in subprocess stdin queue.
 * Prevents OOM if subprocess stdin is backpressured (e.g., slow PTY consumer).
 * 2MB is generous - typical large paste is ~50KB.
 */
const MAX_SUBPROCESS_STDIN_QUEUE_BYTES = 2_000_000;

// =============================================================================
// Types
// =============================================================================

export interface SessionOptions {
	sessionId: string;
	workspaceId: string;
	paneId: string;
	tabId: string;
	cols: number;
	rows: number;
	cwd: string;
	env?: Record<string, string>;
	shell?: string;
	workspaceName?: string;
	workspacePath?: string;
	rootPath?: string;
	scrollbackLines?: number;
}

export interface AttachedClient {
	socket: Socket;
	attachedAt: number;
}

// =============================================================================
// Session Class
// =============================================================================

export class Session {
	readonly sessionId: string;
	readonly workspaceId: string;
	readonly paneId: string;
	readonly tabId: string;
	readonly shell: string;
	readonly createdAt: Date;

	private subprocess: ChildProcess | null = null;
	private subprocessReady = false;
	private emulator: HeadlessEmulator;
	private attachedClients: Map<Socket, AttachedClient> = new Map();
	private clientSocketsWaitingForDrain: Set<Socket> = new Set();
	private subprocessStdoutPaused = false;
	private lastAttachedAt: Date;
	private exitCode: number | null = null;
	private disposed = false;
	private terminatingAt: number | null = null;
	private subprocessDecoder: PtySubprocessFrameDecoder | null = null;
	private subprocessStdinQueue: Buffer[] = [];
	private subprocessStdinQueuedBytes = 0;
	private subprocessStdinDrainArmed = false;
	private ptyPid: number | null = null;

	// Promise that resolves when PTY is ready to accept writes
	private ptyReadyPromise: Promise<void>;
	private ptyReadyResolve: (() => void) | null = null;

	private emulatorWriteQueue: string[] = [];
	private emulatorWriteQueuedBytes = 0;
	private emulatorWriteScheduled = false;
	private emulatorFlushWaiters: Array<() => void> = [];

	// Snapshot boundary tracking - allows capturing consistent state with continuous output
	private snapshotBoundaryIndex: number | null = null;
	private snapshotBoundaryWaiters: Array<() => void> = [];

	// Callbacks
	private onSessionExit?: (
		sessionId: string,
		exitCode: number,
		signal?: number,
	) => void;

	constructor(options: SessionOptions) {
		this.sessionId = options.sessionId;
		this.workspaceId = options.workspaceId;
		this.paneId = options.paneId;
		this.tabId = options.tabId;
		this.shell = options.shell || this.getDefaultShell();
		this.createdAt = new Date();
		this.lastAttachedAt = new Date();

		// Initialize PTY ready promise
		this.ptyReadyPromise = new Promise((resolve) => {
			this.ptyReadyResolve = resolve;
		});

		// Create headless emulator
		this.emulator = new HeadlessEmulator({
			cols: options.cols,
			rows: options.rows,
			scrollback: options.scrollbackLines ?? 10000,
		});

		// Set initial CWD
		this.emulator.setCwd(options.cwd);

		// Listen for emulator output (query responses)
		this.emulator.onData((data) => {
			// If no clients attached, send responses back to PTY
			if (
				this.attachedClients.size === 0 &&
				this.subprocess &&
				this.subprocessReady
			) {
				this.sendWriteToSubprocess(data);
			}
		});
	}

	/**
	 * Spawn the PTY process via subprocess
	 */
	spawn(options: {
		cwd: string;
		cols: number;
		rows: number;
		env?: Record<string, string>;
	}): void {
		if (this.subprocess) {
			throw new Error("PTY already spawned");
		}

		const { cwd, cols, rows, env = {} } = options;

		// Merge process.env with passed env (passed takes precedence), then filter
		const processEnv = buildSafeEnv({ ...process.env, ...env } as Record<
			string,
			string
		>);
		processEnv.TERM = "xterm-256color";

		const shellArgs = this.getShellArgs(this.shell);
		const subprocessPath = path.join(__dirname, "pty-subprocess.js");

		// Spawn subprocess with filtered env to prevent leaking NODE_ENV etc.
		const electronPath = process.execPath;
		this.subprocess = spawn(electronPath, [subprocessPath], {
			stdio: ["pipe", "pipe", "inherit"],
			env: { ...processEnv, ELECTRON_RUN_AS_NODE: "1" },
		});

		// Read framed messages from subprocess stdout
		if (this.subprocess.stdout) {
			this.subprocessDecoder = new PtySubprocessFrameDecoder();
			this.subprocess.stdout.on("data", (chunk: Buffer) => {
				try {
					const frames = this.subprocessDecoder?.push(chunk) ?? [];
					for (const frame of frames) {
						this.handleSubprocessFrame(frame.type, frame.payload);
					}
				} catch (error) {
					console.error(
						`[Session ${this.sessionId}] Failed to parse subprocess frames:`,
						error,
					);
				}
			});
		}

		// Handle subprocess exit
		this.subprocess.on("exit", (code) => {
			console.log(
				`[Session ${this.sessionId}] Subprocess exited with code ${code}`,
			);
			this.handleSubprocessExit(code ?? -1);
		});

		this.subprocess.on("error", (error) => {
			console.error(`[Session ${this.sessionId}] Subprocess error:`, error);
			this.handleSubprocessExit(-1);
		});

		// Store pending spawn config
		this.pendingSpawn = {
			shell: this.shell,
			args: shellArgs,
			cwd,
			cols,
			rows,
			env: processEnv,
		};
	}

	private pendingSpawn: {
		shell: string;
		args: string[];
		cwd: string;
		cols: number;
		rows: number;
		env: Record<string, string>;
	} | null = null;

	/**
	 * Handle frames from the PTY subprocess
	 */
	private handleSubprocessFrame(
		type: PtySubprocessIpcType,
		payload: Buffer,
	): void {
		switch (type) {
			case PtySubprocessIpcType.Ready:
				this.subprocessReady = true;
				if (this.pendingSpawn) {
					this.sendSpawnToSubprocess(this.pendingSpawn);
					this.pendingSpawn = null;
				}
				break;

			case PtySubprocessIpcType.Spawned:
				this.ptyPid = payload.length >= 4 ? payload.readUInt32LE(0) : null;
				// Resolve the ready promise so callers can await PTY readiness
				if (this.ptyReadyResolve) {
					this.ptyReadyResolve();
					this.ptyReadyResolve = null;
				}
				break;

			case PtySubprocessIpcType.Data: {
				if (payload.length === 0) break;
				const data = payload.toString("utf8");

				this.enqueueEmulatorWrite(data);

				this.broadcastEvent("data", {
					type: "data",
					data,
				} satisfies TerminalDataEvent);
				break;
			}

			case PtySubprocessIpcType.Exit: {
				const exitCode = payload.length >= 4 ? payload.readInt32LE(0) : 0;
				const signal = payload.length >= 8 ? payload.readInt32LE(4) : 0;
				this.exitCode = exitCode;

				this.broadcastEvent("exit", {
					type: "exit",
					exitCode,
					signal: signal !== 0 ? signal : undefined,
				} satisfies TerminalExitEvent);

				this.onSessionExit?.(
					this.sessionId,
					exitCode,
					signal !== 0 ? signal : undefined,
				);
				break;
			}

			case PtySubprocessIpcType.Error: {
				const errorMessage =
					payload.length > 0
						? payload.toString("utf8")
						: "Unknown subprocess error";

				console.error(
					`[Session ${this.sessionId}] Subprocess error:`,
					errorMessage,
				);

				this.broadcastEvent("error", {
					type: "error",
					error: errorMessage,
					code: errorMessage.includes("Write queue full")
						? "WRITE_QUEUE_FULL"
						: "SUBPROCESS_ERROR",
				} satisfies TerminalErrorEvent);
				break;
			}
		}
	}

	/**
	 * Handle subprocess exiting
	 */
	private handleSubprocessExit(exitCode: number): void {
		if (this.exitCode === null) {
			this.exitCode = exitCode;

			this.broadcastEvent("exit", {
				type: "exit",
				exitCode,
			} satisfies TerminalExitEvent);

			this.onSessionExit?.(this.sessionId, exitCode);
		}

		// Ensure waiters don't hang forever if the subprocess exits before sending Spawned.
		// Callers must still check isAlive before writing.
		if (this.ptyReadyResolve) {
			this.ptyReadyResolve();
			this.ptyReadyResolve = null;
		}

		this.resetProcessState();
	}

	/**
	 * Flush queued frames to subprocess stdin, respecting stream backpressure.
	 */
	private flushSubprocessStdinQueue(): void {
		if (!this.subprocess?.stdin || this.disposed) return;

		while (this.subprocessStdinQueue.length > 0) {
			const buf = this.subprocessStdinQueue[0];
			const canWrite = this.subprocess.stdin.write(buf);
			if (!canWrite) {
				if (!this.subprocessStdinDrainArmed) {
					this.subprocessStdinDrainArmed = true;
					this.subprocess.stdin.once("drain", () => {
						this.subprocessStdinDrainArmed = false;
						this.flushSubprocessStdinQueue();
					});
				}
				return;
			}

			this.subprocessStdinQueue.shift();
			this.subprocessStdinQueuedBytes -= buf.length;
		}
	}

	/**
	 * Send a frame to the subprocess.
	 * Returns false if write buffer is full (caller should handle).
	 */
	private sendFrameToSubprocess(
		type: PtySubprocessIpcType,
		payload?: Buffer,
	): boolean {
		if (!this.subprocess?.stdin || this.disposed) return false;

		const payloadBuffer = payload ?? Buffer.alloc(0);
		const frameSize = 5 + payloadBuffer.length; // 5-byte header + payload

		// Check queue limit to prevent OOM under backpressure
		if (
			this.subprocessStdinQueuedBytes + frameSize >
			MAX_SUBPROCESS_STDIN_QUEUE_BYTES
		) {
			console.warn(
				`[Session ${this.sessionId}] stdin queue full (${this.subprocessStdinQueuedBytes} bytes), dropping frame`,
			);
			this.broadcastEvent("error", {
				type: "error",
				error: "Write queue full - input dropped",
				code: "WRITE_QUEUE_FULL",
			} satisfies TerminalErrorEvent);
			return false;
		}

		const header = createFrameHeader(type, payloadBuffer.length);

		this.subprocessStdinQueue.push(header);
		this.subprocessStdinQueuedBytes += header.length;

		if (payloadBuffer.length > 0) {
			this.subprocessStdinQueue.push(payloadBuffer);
			this.subprocessStdinQueuedBytes += payloadBuffer.length;
		}

		const wasBackpressured = this.subprocessStdinDrainArmed;
		this.flushSubprocessStdinQueue();

		if (this.subprocessStdinDrainArmed && !wasBackpressured) {
			console.warn(
				`[Session ${this.sessionId}] stdin buffer full, write may be delayed`,
			);
		}

		return !this.subprocessStdinDrainArmed;
	}

	private sendSpawnToSubprocess(payload: {
		shell: string;
		args: string[];
		cwd: string;
		cols: number;
		rows: number;
		env: Record<string, string>;
	}): boolean {
		return this.sendFrameToSubprocess(
			PtySubprocessIpcType.Spawn,
			Buffer.from(JSON.stringify(payload), "utf8"),
		);
	}

	private sendWriteToSubprocess(data: string): boolean {
		// Chunk large writes to avoid allocating/queuing massive single frames.
		const MAX_CHUNK_CHARS = 8192;
		let ok = true;

		for (let offset = 0; offset < data.length; offset += MAX_CHUNK_CHARS) {
			const part = data.slice(offset, offset + MAX_CHUNK_CHARS);
			ok =
				this.sendFrameToSubprocess(
					PtySubprocessIpcType.Write,
					Buffer.from(part, "utf8"),
				) && ok;
		}

		return ok;
	}

	private sendResizeToSubprocess(cols: number, rows: number): boolean {
		const payload = Buffer.allocUnsafe(8);
		payload.writeUInt32LE(cols, 0);
		payload.writeUInt32LE(rows, 4);
		return this.sendFrameToSubprocess(PtySubprocessIpcType.Resize, payload);
	}

	private sendKillToSubprocess(signal?: string): boolean {
		const payload = signal ? Buffer.from(signal, "utf8") : undefined;
		return this.sendFrameToSubprocess(PtySubprocessIpcType.Kill, payload);
	}

	private sendSignalToSubprocess(signal: string): boolean {
		const payload = Buffer.from(signal, "utf8");
		return this.sendFrameToSubprocess(PtySubprocessIpcType.Signal, payload);
	}

	private sendDisposeToSubprocess(): boolean {
		return this.sendFrameToSubprocess(PtySubprocessIpcType.Dispose);
	}

	private enqueueEmulatorWrite(data: string): void {
		this.emulatorWriteQueue.push(data);
		this.emulatorWriteQueuedBytes += data.length;
		this.scheduleEmulatorWrite();
	}

	private scheduleEmulatorWrite(): void {
		if (this.emulatorWriteScheduled || this.disposed) return;
		this.emulatorWriteScheduled = true;
		setImmediate(() => {
			this.processEmulatorWriteQueue();
		});
	}

	private processEmulatorWriteQueue(): void {
		if (this.disposed) {
			this.emulatorWriteQueue = [];
			this.emulatorWriteQueuedBytes = 0;
			this.emulatorWriteScheduled = false;
			this.snapshotBoundaryIndex = null;
			const waiters = this.emulatorFlushWaiters;
			this.emulatorFlushWaiters = [];
			for (const resolve of waiters) resolve();
			const boundaryWaiters = this.snapshotBoundaryWaiters;
			this.snapshotBoundaryWaiters = [];
			for (const resolve of boundaryWaiters) resolve();
			return;
		}

		const start = performance.now();
		const hasClients = this.attachedClients.size > 0;
		const backlogBytes = this.emulatorWriteQueuedBytes;

		// Keep the daemon responsive while still ensuring the emulator catches up eventually.
		const baseBudgetMs = hasClients ? 5 : 25;
		const budgetMs =
			backlogBytes > 1024 * 1024 ? Math.max(baseBudgetMs, 25) : baseBudgetMs;
		const MAX_CHUNK_CHARS = 8192;

		while (this.emulatorWriteQueue.length > 0) {
			if (performance.now() - start > budgetMs) break;

			let chunk = this.emulatorWriteQueue[0];
			if (chunk.length > MAX_CHUNK_CHARS) {
				this.emulatorWriteQueue[0] = chunk.slice(MAX_CHUNK_CHARS);
				chunk = chunk.slice(0, MAX_CHUNK_CHARS);
			} else {
				this.emulatorWriteQueue.shift();

				// Decrement boundary counter if tracking
				if (this.snapshotBoundaryIndex !== null) {
					this.snapshotBoundaryIndex--;
				}
			}

			this.emulatorWriteQueuedBytes -= chunk.length;
			this.emulator.write(chunk);

			// Check if we've reached the snapshot boundary (processed all items up to it)
			if (this.snapshotBoundaryIndex === 0) {
				this.snapshotBoundaryIndex = null;
				const boundaryWaiters = this.snapshotBoundaryWaiters;
				this.snapshotBoundaryWaiters = [];
				for (const resolve of boundaryWaiters) resolve();
				// Continue processing remaining items (arrived after boundary was set)
				if (this.emulatorWriteQueue.length > 0) {
					setImmediate(() => {
						this.processEmulatorWriteQueue();
					});
					return;
				}
				this.emulatorWriteScheduled = false;
				const waiters = this.emulatorFlushWaiters;
				this.emulatorFlushWaiters = [];
				for (const resolve of waiters) resolve();
				return;
			}
		}

		if (this.emulatorWriteQueue.length > 0) {
			setImmediate(() => {
				this.processEmulatorWriteQueue();
			});
			return;
		}

		this.emulatorWriteScheduled = false;

		// If we've drained the queue, any pending boundary is also reached
		if (this.snapshotBoundaryIndex !== null) {
			this.snapshotBoundaryIndex = null;
			const boundaryWaiters = this.snapshotBoundaryWaiters;
			this.snapshotBoundaryWaiters = [];
			for (const resolve of boundaryWaiters) resolve();
		}

		const waiters = this.emulatorFlushWaiters;
		this.emulatorFlushWaiters = [];
		for (const resolve of waiters) resolve();
	}

	/**
	 * Flush emulator writes up to current queue position (snapshot boundary).
	 * Unlike flushEmulatorWrites, this captures a consistent point-in-time state
	 * even with continuous output - we only wait for data received BEFORE this call.
	 *
	 * The key insight: snapshotBoundaryIndex tracks how many items REMAIN that
	 * need to be processed. Each time we shift an item, we decrement it.
	 * When it reaches 0, we've processed everything up to the boundary.
	 */
	private async flushToSnapshotBoundary(timeoutMs: number): Promise<boolean> {
		// Mark the current queue length as how many items we need to process
		const itemsToProcess = this.emulatorWriteQueue.length;

		if (itemsToProcess === 0 && !this.emulatorWriteScheduled) {
			return true; // Already flushed
		}

		// Set the boundary counter - processEmulatorWriteQueue will decrement this
		this.snapshotBoundaryIndex = itemsToProcess;

		const boundaryPromise = new Promise<void>((resolve) => {
			this.snapshotBoundaryWaiters.push(resolve);
			this.scheduleEmulatorWrite();
		});

		const timeoutPromise = new Promise<void>((resolve) =>
			setTimeout(resolve, timeoutMs),
		);

		await Promise.race([boundaryPromise, timeoutPromise]);

		// Check if we actually reached the boundary or timed out
		const reachedBoundary = this.snapshotBoundaryIndex === null;

		// Clean up if timed out (boundary wasn't reached)
		if (!reachedBoundary) {
			this.snapshotBoundaryIndex = null;
			// Remove our waiter from the list
			this.snapshotBoundaryWaiters = [];
		}

		return reachedBoundary;
	}

	/**
	 * Check if session is alive (PTY running)
	 */
	get isAlive(): boolean {
		return this.subprocess !== null && this.exitCode === null;
	}

	/**
	 * Get the PTY process ID for port scanning.
	 * Returns null if PTY not yet spawned or has exited.
	 */
	get pid(): number | null {
		return this.ptyPid;
	}

	/**
	 * Check if session is in the process of terminating.
	 * A terminating session has received a kill signal but hasn't exited yet.
	 */
	get isTerminating(): boolean {
		return this.terminatingAt !== null;
	}

	/**
	 * Check if session can be attached to.
	 * A session is attachable if it's alive and not terminating.
	 * This prevents race conditions where createOrAttach is called
	 * immediately after kill but before the PTY has actually exited.
	 */
	get isAttachable(): boolean {
		return this.isAlive && !this.isTerminating;
	}

	/**
	 * Wait for PTY to be ready to accept writes.
	 * Returns immediately if already ready, or waits for Spawned event.
	 */
	waitForReady(): Promise<void> {
		return this.ptyReadyPromise;
	}

	/**
	 * Get number of attached clients
	 */
	get clientCount(): number {
		return this.attachedClients.size;
	}

	/**
	 * Attach a client to this session
	 */
	async attach(socket: Socket): Promise<TerminalSnapshot> {
		if (this.disposed) {
			throw new Error("Session disposed");
		}

		this.attachedClients.set(socket, {
			socket,
			attachedAt: Date.now(),
		});
		this.lastAttachedAt = new Date();

		// Use snapshot boundary flush for consistent state with continuous output.
		// This ensures we capture all data received BEFORE attach was called,
		// even if new data continues to arrive during the flush.
		const reachedBoundary = await this.flushToSnapshotBoundary(
			ATTACH_FLUSH_TIMEOUT_MS,
		);

		if (!reachedBoundary) {
			console.warn(
				`[Session ${this.sessionId}] Attach flush timeout after ${ATTACH_FLUSH_TIMEOUT_MS}ms`,
			);
		}

		return this.emulator.getSnapshotAsync();
	}

	/**
	 * Detach a client from this session
	 */
	detach(socket: Socket): void {
		this.attachedClients.delete(socket);
		this.clientSocketsWaitingForDrain.delete(socket);
		this.maybeResumeSubprocessStdout();
	}

	/**
	 * Write data to PTY (non-blocking - sent to subprocess)
	 */
	write(data: string): void {
		if (!this.subprocess || !this.subprocessReady) {
			throw new Error("PTY not spawned");
		}
		this.sendWriteToSubprocess(data);
	}

	/**
	 * Resize PTY and emulator
	 */
	resize(cols: number, rows: number): void {
		if (this.subprocess && this.subprocessReady) {
			this.sendResizeToSubprocess(cols, rows);
		}
		this.emulator.resize(cols, rows);
	}

	/**
	 * Clear scrollback buffer
	 */
	clearScrollback(): void {
		this.emulator.clear();
	}

	/**
	 * Get session snapshot
	 */
	getSnapshot(): TerminalSnapshot {
		return this.emulator.getSnapshot();
	}

	/**
	 * Get session metadata
	 */
	getMeta(): SessionMeta {
		const dims = this.emulator.getDimensions();
		return {
			sessionId: this.sessionId,
			workspaceId: this.workspaceId,
			paneId: this.paneId,
			cwd: this.emulator.getCwd() || "",
			cols: dims.cols,
			rows: dims.rows,
			createdAt: this.createdAt.toISOString(),
			lastAttachedAt: this.lastAttachedAt.toISOString(),
			shell: this.shell,
		};
	}

	/**
	 * Send a signal to the PTY process without marking the session as terminating.
	 * Used for signals like SIGINT (Ctrl+C) where the process should continue running.
	 */
	sendSignal(signal: string): void {
		if (this.terminatingAt !== null || this.disposed) {
			return;
		}

		if (this.subprocess && this.subprocessReady) {
			this.sendSignalToSubprocess(signal);
		}
	}

	/**
	 * Kill the PTY process.
	 * Marks the session as terminating immediately (idempotent).
	 * The actual PTY termination is async - use isTerminating to check state.
	 */
	kill(signal: string = "SIGTERM"): void {
		// Idempotent: if already terminating, don't send another signal
		if (this.terminatingAt !== null) {
			return;
		}

		// Mark as terminating immediately to prevent race conditions
		this.terminatingAt = Date.now();

		if (this.subprocess && this.subprocessReady) {
			this.sendKillToSubprocess(signal);
			return;
		}

		// If the subprocess isn't ready yet, fall back to killing the subprocess itself
		// so session termination is reliable (differentiation isn't meaningful pre-spawn).
		try {
			this.subprocess?.kill(signal as NodeJS.Signals);
		} catch {
			// Process may already be dead
		}
	}

	/** Callers that don't need to wait can fire-and-forget. */
	dispose(): Promise<void> {
		if (this.disposed) return Promise.resolve();
		this.disposed = true;

		const pidsToKill = this.collectProcessPids();

		if (this.subprocess) {
			this.sendDisposeToSubprocess();
		}

		this.resetProcessState();
		this.emulator.dispose();
		this.attachedClients.clear();
		this.clientSocketsWaitingForDrain.clear();

		if (pidsToKill.length === 0) return Promise.resolve();

		// Must await: treeKill enumerates descendants via ps/pgrep before signaling
		return Promise.all(
			pidsToKill.map((pid) => treeKillAsync(pid, "SIGKILL")),
		).then(() => {});
	}

	/** Includes PTY PID as safety net in case the shell was reparented after subprocess exit. */
	private collectProcessPids(): number[] {
		const pids: number[] = [];
		if (this.subprocess?.pid) pids.push(this.subprocess.pid);
		if (this.ptyPid) pids.push(this.ptyPid);
		return pids;
	}

	private resetProcessState(): void {
		this.subprocess = null;
		this.subprocessReady = false;
		this.subprocessDecoder = null;
		this.subprocessStdinQueue = [];
		this.subprocessStdinQueuedBytes = 0;
		this.subprocessStdinDrainArmed = false;
		this.subprocessStdoutPaused = false;

		this.emulatorWriteQueue = [];
		this.emulatorWriteQueuedBytes = 0;
		this.emulatorWriteScheduled = false;
		this.snapshotBoundaryIndex = null;
		const waiters = this.emulatorFlushWaiters;
		this.emulatorFlushWaiters = [];
		for (const resolve of waiters) resolve();
		const boundaryWaiters = this.snapshotBoundaryWaiters;
		this.snapshotBoundaryWaiters = [];
		for (const resolve of boundaryWaiters) resolve();
	}

	/**
	 * Set exit callback
	 */
	onExit(
		callback: (sessionId: string, exitCode: number, signal?: number) => void,
	): void {
		this.onSessionExit = callback;
	}

	// ===========================================================================
	// Private Methods
	// ===========================================================================

	/**
	 * Broadcast an event to all attached clients with backpressure awareness.
	 */
	private broadcastEvent(
		eventType: string,
		payload: TerminalDataEvent | TerminalExitEvent | TerminalErrorEvent,
	): void {
		const event: IpcEvent = {
			type: "event",
			event: eventType,
			sessionId: this.sessionId,
			payload,
		};

		const message = `${JSON.stringify(event)}\n`;

		for (const { socket } of this.attachedClients.values()) {
			try {
				const canWrite = socket.write(message);
				if (!canWrite) {
					// Socket buffer full - data will be queued but may cause memory pressure
					// In production, could track this and pause PTY output temporarily
					console.warn(
						`[Session ${this.sessionId}] Client socket buffer full, output may be delayed`,
					);
					this.handleClientBackpressure(socket);
				}
			} catch {
				this.attachedClients.delete(socket);
				this.clientSocketsWaitingForDrain.delete(socket);
			}
		}
	}

	private handleClientBackpressure(socket: Socket): void {
		// If the client can’t keep up, pause reading from the subprocess stdout.
		// This will backpressure the subprocess stdout pipe, which in turn pauses
		// PTY reads inside the subprocess (preventing runaway buffering/CPU).
		if (!this.subprocessStdoutPaused && this.subprocess?.stdout) {
			this.subprocessStdoutPaused = true;
			this.subprocess.stdout.pause();
		}

		if (this.clientSocketsWaitingForDrain.has(socket)) return;
		this.clientSocketsWaitingForDrain.add(socket);

		socket.once("drain", () => {
			this.clientSocketsWaitingForDrain.delete(socket);
			this.maybeResumeSubprocessStdout();
		});
	}

	private maybeResumeSubprocessStdout(): void {
		if (this.clientSocketsWaitingForDrain.size > 0) return;
		if (!this.subprocessStdoutPaused) return;
		if (!this.subprocess?.stdout) return;

		this.subprocessStdoutPaused = false;
		this.subprocess.stdout.resume();
	}

	/**
	 * Get default shell for the platform
	 */
	private getDefaultShell(): string {
		if (process.platform === "win32") {
			return process.env.COMSPEC || "cmd.exe";
		}
		return process.env.SHELL || "/bin/zsh";
	}

	/**
	 * Get shell arguments for login shell
	 */
	private getShellArgs(shell: string): string[] {
		const shellName = shell.split("/").pop() || "";

		if (["zsh", "bash", "sh", "ksh", "fish"].includes(shellName)) {
			return ["-l"];
		}

		return [];
	}
}

// =============================================================================
// Factory Functions
// =============================================================================

/**
 * Create a new session from request parameters
 */
export function createSession(request: CreateOrAttachRequest): Session {
	return new Session({
		sessionId: request.sessionId,
		workspaceId: request.workspaceId,
		paneId: request.paneId,
		tabId: request.tabId,
		cols: request.cols,
		rows: request.rows,
		cwd: request.cwd || process.env.HOME || "/",
		env: request.env,
		shell: request.shell,
		workspaceName: request.workspaceName,
		workspacePath: request.workspacePath,
		rootPath: request.rootPath,
	});
}
