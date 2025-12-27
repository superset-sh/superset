import type * as pty from "node-pty";

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

	attachSession(name: string): Promise<pty.IPty>;
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
