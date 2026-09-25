export type HarnessEnv = Record<string, string | undefined> | undefined;

/** Everything known about where one harness session might live. */
export interface HarnessSessionRef {
	agentId: string | null | undefined;
	sessionId: string | null | undefined;
	worktreePath?: string | null;
	/** The file the harness's own hook said it writes this session to. */
	reportedPath?: string | null;
	/** The launch env, so a pinned provider account is read from its own dir. */
	env?: HarnessEnv;
}

/** A ref whose agent and session id are present and safe to put in a path. */
export interface HarnessSessionQuery {
	sessionId: string;
	worktreePath: string | null;
	env: HarnessEnv;
}

/** A store that keeps one file per session. */
export interface HarnessSessionFiles {
	/** The session's file, found from the harness's layout under `env`. */
	locate(query: HarnessSessionQuery): string | null;
	/**
	 * The conversation turns in a chunk of a session file, for handing it to
	 * another agent. The chunk may start mid-line.
	 */
	parseTurns?(raw: string): string[];
}

/**
 * The harness-specific half of reading a session back: where its store
 * lives and what its files look like. The lookup order, the trust rule for a
 * reported path, and the bounded read are shared and never name a harness.
 *
 * Register one in `HARNESS_SESSION_STORES`.
 */
export interface HarnessSessionStore {
	files?: HarnessSessionFiles;
	/**
	 * Whether the harness keeps this session. `null` means it cannot tell,
	 * which callers must not read as absence: `false` refuses a fork. Without
	 * one, a located file answers `true` and anything else `null`.
	 */
	hasSession?(query: HarnessSessionQuery): boolean | null;
}
