import type * as pty from "node-pty";

/** Error types from tmux operations */
export type TmuxError =
	| "NO_SERVER"
	| "NO_SESSION"
	| "SOCKET_MISSING"
	| "TMUX_NOT_FOUND"
	| "ATTACH_FAILED";

/** Session lifecycle states for persistent terminals */
export type SessionState =
	| "disconnected" // tmux session exists, no attach PTY
	| "connecting" // spawn attach in progress
	| "connected" // attach PTY alive and wired
	| "reconnecting" // auto-reconnect in progress
	| "failed" // unrecoverable error
	| "closed"; // session ended (user exit or killed)

export interface PersistenceBackend {
	name: "tmux";

	isAvailable(): Promise<boolean>;

	sessionExists(sessionName: string): Promise<boolean>;
	listSessions(prefix: string): Promise<string[]>;

	createSession(opts: {
		name: string;
		cwd: string;
		shell: string;
		env: Record<string, string>;
	}): Promise<void>;

	attachSession(name: string, cols?: number, rows?: number): Promise<pty.IPty>;
	detachSession(name: string): Promise<void>;
	killSession(name: string): Promise<void>;

	captureScrollback(name: string): Promise<string>;

	getSessionLastActivity?(name: string): Promise<number | null>;
	cleanupOrphanedScripts?(): Promise<void>;
}

export interface CreatePersistentSessionParams {
	name: string;
	cwd: string;
	shell: string;
	env: Record<string, string>;
}
