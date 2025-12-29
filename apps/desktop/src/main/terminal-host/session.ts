/**
 * Terminal Host Session
 *
 * A session owns:
 * - A PTY process (node-pty)
 * - A HeadlessEmulator instance for state tracking
 * - A set of attached clients
 * - Output capture to disk
 */

import type { Socket } from "node:net";
import * as pty from "node-pty";
import { HeadlessEmulator } from "../lib/terminal-host/headless-emulator";
import type {
	CreateOrAttachRequest,
	IpcEvent,
	SessionMeta,
	TerminalDataEvent,
	TerminalExitEvent,
	TerminalSnapshot,
} from "../lib/terminal-host/types";

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

	private ptyProcess: pty.IPty | null = null;
	private emulator: HeadlessEmulator;
	private attachedClients: Map<Socket, AttachedClient> = new Map();
	private lastAttachedAt: Date;
	private exitCode: number | null = null;
	private disposed = false;

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
			// This allows TUIs to function while app is closed
			if (this.attachedClients.size === 0 && this.ptyProcess) {
				this.ptyProcess.write(data);
			}
			// When clients are attached, the renderer handles responses
		});
	}

	/**
	 * Spawn the PTY process
	 */
	spawn(options: {
		cwd: string;
		cols: number;
		rows: number;
		env?: Record<string, string>;
	}): void {
		if (this.ptyProcess) {
			throw new Error("PTY already spawned");
		}

		const { cwd, cols, rows, env = {} } = options;

		// Build environment - filter out undefined values and ELECTRON_RUN_AS_NODE
		const processEnv: Record<string, string> = {};
		for (const [key, value] of Object.entries(process.env)) {
			// Skip ELECTRON_RUN_AS_NODE (daemon runs with this, but spawned shells shouldn't)
			if (key === "ELECTRON_RUN_AS_NODE") continue;
			if (value !== undefined) {
				processEnv[key] = value;
			}
		}
		// Add custom env vars
		Object.assign(processEnv, env);
		// Ensure TERM is set
		processEnv.TERM = "xterm-256color";

		// Get shell args
		const shellArgs = this.getShellArgs(this.shell);

		this.ptyProcess = pty.spawn(this.shell, shellArgs, {
			name: "xterm-256color",
			cols,
			rows,
			cwd,
			env: processEnv,
		});

		// Handle PTY data
		this.ptyProcess.onData((data) => {
			// Feed data to emulator for state tracking
			this.emulator.write(data);

			// Send to all attached clients
			this.broadcastEvent("data", {
				type: "data",
				data,
			} satisfies TerminalDataEvent);
		});

		// Handle PTY exit
		this.ptyProcess.onExit(({ exitCode, signal }) => {
			this.exitCode = exitCode;

			// Notify attached clients
			this.broadcastEvent("exit", {
				type: "exit",
				exitCode,
				signal,
			} satisfies TerminalExitEvent);

			// Notify session manager
			this.onSessionExit?.(this.sessionId, exitCode, signal);
		});
	}

	/**
	 * Check if session is alive (PTY running)
	 */
	get isAlive(): boolean {
		return this.ptyProcess !== null && this.exitCode === null;
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
	attach(socket: Socket): TerminalSnapshot {
		if (this.disposed) {
			throw new Error("Session disposed");
		}

		// Track client
		this.attachedClients.set(socket, {
			socket,
			attachedAt: Date.now(),
		});
		this.lastAttachedAt = new Date();

		// Handle client disconnect
		const cleanup = () => {
			this.attachedClients.delete(socket);
		};
		socket.once("close", cleanup);
		socket.once("error", cleanup);

		// Return current snapshot
		return this.emulator.getSnapshot();
	}

	/**
	 * Detach a client from this session
	 */
	detach(socket: Socket): void {
		this.attachedClients.delete(socket);
	}

	/**
	 * Write data to PTY
	 */
	write(data: string): void {
		if (!this.ptyProcess) {
			throw new Error("PTY not spawned");
		}
		this.ptyProcess.write(data);
	}

	/**
	 * Resize PTY and emulator
	 */
	resize(cols: number, rows: number): void {
		if (this.ptyProcess) {
			this.ptyProcess.resize(cols, rows);
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
	 * Get session snapshot (for debugging/inspection)
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
	 * Kill the PTY process
	 */
	kill(signal: string = "SIGTERM"): void {
		if (this.ptyProcess) {
			try {
				this.ptyProcess.kill(signal);
			} catch {
				// Process might already be dead
			}
		}
	}

	/**
	 * Dispose of the session
	 */
	dispose(): void {
		if (this.disposed) return;
		this.disposed = true;

		// Kill PTY
		this.kill("SIGKILL");
		this.ptyProcess = null;

		// Dispose emulator
		this.emulator.dispose();

		// Clear clients
		this.attachedClients.clear();
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
	 * Broadcast an event to all attached clients
	 */
	private broadcastEvent(
		eventType: string,
		payload: TerminalDataEvent | TerminalExitEvent,
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
				socket.write(message);
			} catch {
				// Client might have disconnected
				this.attachedClients.delete(socket);
			}
		}
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

		// Common shells that support login shell
		if (["zsh", "bash", "sh", "ksh", "fish"].includes(shellName)) {
			return ["-l"]; // Login shell
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
