/**
 * Terminal Host Daemon Protocol Types
 *
 * This file defines the IPC protocol between the Electron main process
 * and the terminal host daemon. Changes must be additive-only for
 * backwards compatibility.
 */

// Protocol version - increment for breaking changes
export const PROTOCOL_VERSION = 2;

// =============================================================================
// Mode Tracking
// =============================================================================

/**
 * Terminal modes that affect input behavior and must be restored on attach.
 * These correspond to DECSET/DECRST (CSI ? Pm h/l) escape sequences.
 */
export interface TerminalModes {
	/** DECCKM - Application cursor keys (mode 1) */
	applicationCursorKeys: boolean;
	/** Bracketed paste mode (mode 2004) */
	bracketedPaste: boolean;
	/** X10 mouse tracking (mode 9) */
	mouseTrackingX10: boolean;
	/** Normal mouse tracking - button events (mode 1000) */
	mouseTrackingNormal: boolean;
	/** Highlight mouse tracking (mode 1001) */
	mouseTrackingHighlight: boolean;
	/** Button-event mouse tracking (mode 1002) */
	mouseTrackingButtonEvent: boolean;
	/** Any-event mouse tracking (mode 1003) */
	mouseTrackingAnyEvent: boolean;
	/** Focus reporting (mode 1004) */
	focusReporting: boolean;
	/** UTF-8 mouse mode (mode 1005) */
	mouseUtf8: boolean;
	/** SGR mouse mode (mode 1006) */
	mouseSgr: boolean;
	/** Alternate screen buffer (mode 1049 or 47) */
	alternateScreen: boolean;
	/** Cursor visibility (mode 25) */
	cursorVisible: boolean;
	/** Origin mode (mode 6) */
	originMode: boolean;
	/** Auto-wrap mode (mode 7) */
	autoWrap: boolean;
}

/**
 * Default terminal modes (standard terminal state)
 */
export const DEFAULT_MODES: TerminalModes = {
	applicationCursorKeys: false,
	bracketedPaste: false,
	mouseTrackingX10: false,
	mouseTrackingNormal: false,
	mouseTrackingHighlight: false,
	mouseTrackingButtonEvent: false,
	mouseTrackingAnyEvent: false,
	focusReporting: false,
	mouseUtf8: false,
	mouseSgr: false,
	alternateScreen: false,
	cursorVisible: true,
	originMode: false,
	autoWrap: true,
};

// =============================================================================
// Snapshot Types
// =============================================================================

/**
 * Snapshot payload returned when attaching to a session.
 * Contains everything needed to restore terminal state in the renderer.
 */
export interface TerminalSnapshot {
	/** Serialized screen state (ANSI sequences to reproduce screen) */
	snapshotAnsi: string;
	/** Control sequences to restore input-affecting modes */
	rehydrateSequences: string;
	/** Current working directory (from OSC-7, may be null) */
	cwd: string | null;
	/** Current terminal modes */
	modes: TerminalModes;
	/** Terminal dimensions */
	cols: number;
	rows: number;
	/** Scrollback line count */
	scrollbackLines: number;
	/** Debug diagnostics for troubleshooting (optional) */
	debug?: {
		/** xterm's internal buffer type */
		xtermBufferType: string;
		/** Whether serialized output contains alt screen entry */
		hasAltScreenEntry: boolean;
		/** Alt buffer stats if in alt screen */
		altBuffer?: {
			lines: number;
			nonEmptyLines: number;
			totalChars: number;
			cursorX: number;
			cursorY: number;
			sampleLines: string[];
		};
		/** Normal buffer line count */
		normalBufferLines: number;
	};
}

// =============================================================================
// Session Types
// =============================================================================

/**
 * Session metadata stored on disk
 */
export interface SessionMeta {
	sessionId: string;
	workspaceId: string;
	paneId: string;
	cwd: string;
	cols: number;
	rows: number;
	createdAt: string;
	lastAttachedAt: string;
	shell: string;
}

// =============================================================================
// IPC Protocol Types
// =============================================================================

/**
 * Hello request - initial handshake with daemon
 */
export interface HelloRequest {
	token: string;
	protocolVersion: number;
	/** Stable ID shared between a client’s control + stream sockets */
	clientId: string;
	/** Socket role: control carries RPC; stream carries events */
	role: "control" | "stream";
}

export interface HelloResponse {
	protocolVersion: number;
	daemonVersion: string;
	daemonPid: number;
}

/**
 * Create or attach to a terminal session
 */
export interface CreateOrAttachRequest {
	sessionId: string;
	cols: number;
	rows: number;
	cwd?: string;
	env?: Record<string, string>;
	shell?: string;
	workspaceId: string;
	paneId: string;
	tabId: string;
	workspaceName?: string;
	workspacePath?: string;
	rootPath?: string;
	initialCommands?: string[];
}

export interface CreateOrAttachResponse {
	isNew: boolean;
	snapshot: TerminalSnapshot;
	wasRecovered: boolean;
	/** PTY process ID for port scanning (null if not yet spawned or exited) */
	pid: number | null;
}

/**
 * Write data to a terminal session
 */
export interface WriteRequest {
	sessionId: string;
	data: string;
}

/**
 * Resize terminal session
 */
export interface ResizeRequest {
	sessionId: string;
	cols: number;
	rows: number;
}

/**
 * Detach from a terminal session (keep running)
 */
export interface DetachRequest {
	sessionId: string;
}

/**
 * Send a signal to a terminal session (e.g., SIGINT for Ctrl+C)
 */
export interface SignalRequest {
	sessionId: string;
	signal: string;
}

/**
 * Kill a terminal session
 */
export interface KillRequest {
	sessionId: string;
	deleteHistory?: boolean;
}

/**
 * Kill all terminal sessions
 */
export interface KillAllRequest {
	deleteHistory?: boolean;
}

/**
 * List all active sessions
 */
export interface ListSessionsResponse {
	sessions: Array<{
		sessionId: string;
		workspaceId: string;
		paneId: string;
		isAlive: boolean;
		attachedClients: number;
		/** PTY process ID (null if not yet spawned or exited) */
		pid: number | null;
		/** ISO timestamp */
		createdAt?: string;
		/** ISO timestamp */
		lastAttachedAt?: string;
		shell?: string;
	}>;
}

/**
 * Clear scrollback for a session
 */
export interface ClearScrollbackRequest {
	sessionId: string;
}

/**
 * Shutdown the daemon gracefully
 */
export interface ShutdownRequest {
	/** Optional: Kill all sessions before shutdown (default: false) */
	killSessions?: boolean;
}

// =============================================================================
// IPC Message Framing
// =============================================================================

/**
 * Request message format (client -> daemon)
 */
export interface IpcRequest {
	id: string;
	type: string;
	payload: unknown;
}

/**
 * Success response format (daemon -> client)
 */
export interface IpcSuccessResponse {
	id: string;
	ok: true;
	payload: unknown;
}

/**
 * Error response format (daemon -> client)
 */
export interface IpcErrorResponse {
	id: string;
	ok: false;
	error: {
		code: string;
		message: string;
	};
}

export type IpcResponse = IpcSuccessResponse | IpcErrorResponse;

/**
 * Event message format (daemon -> client, unsolicited)
 */
export interface IpcEvent {
	type: "event";
	event: string;
	sessionId: string;
	payload: unknown;
}

/**
 * Terminal data event
 */
export interface TerminalDataEvent {
	type: "data";
	data: string;
}

/**
 * Terminal exit event
 */
export interface TerminalExitEvent {
	type: "exit";
	exitCode: number;
	signal?: number;
}

/**
 * Terminal error event (e.g., write queue full, subprocess error)
 */
export interface TerminalErrorEvent {
	type: "error";
	error: string;
	/** Error code for programmatic handling */
	code?: "WRITE_QUEUE_FULL" | "SUBPROCESS_ERROR" | "WRITE_FAILED" | "UNKNOWN";
}

export type TerminalEvent =
	| TerminalDataEvent
	| TerminalExitEvent
	| TerminalErrorEvent;

// =============================================================================
// Request/Response Type Map
// =============================================================================

/** Empty response for operations that don't return data */
export interface EmptyResponse {
	success: true;
}

export type RequestTypeMap = {
	hello: { request: HelloRequest; response: HelloResponse };
	createOrAttach: {
		request: CreateOrAttachRequest;
		response: CreateOrAttachResponse;
	};
	write: { request: WriteRequest; response: EmptyResponse };
	resize: { request: ResizeRequest; response: EmptyResponse };
	detach: { request: DetachRequest; response: EmptyResponse };
	signal: { request: SignalRequest; response: EmptyResponse };
	kill: { request: KillRequest; response: EmptyResponse };
	killAll: { request: KillAllRequest; response: EmptyResponse };
	listSessions: { request: undefined; response: ListSessionsResponse };
	clearScrollback: { request: ClearScrollbackRequest; response: EmptyResponse };
	shutdown: { request: ShutdownRequest; response: EmptyResponse };
};
