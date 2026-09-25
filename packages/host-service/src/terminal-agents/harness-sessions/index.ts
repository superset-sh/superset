import { isAbsolute } from "node:path";
import type { AgentIdentityId } from "@superset/shared/agent-catalog";
import { claudeSessionStore } from "./claude";
import { codexSessionStore } from "./codex";
import { isFile } from "./is-file";
import { opencodeSessionStore } from "./opencode";
import { piSessionStore } from "./pi";
import { readTurnsFromTail } from "./tail";
import type {
	HarnessSessionFiles,
	HarnessSessionQuery,
	HarnessSessionRef,
	HarnessSessionStore,
} from "./types";

export type { HarnessSessionRef } from "./types";

/**
 * Read a session back from the harness's own store when it keeps one.
 *
 * The PTY stream is the universal source, but it is a reconstruction: rows as
 * they were painted, capped by a retention ring, with tool output and UI
 * chrome interleaved. A harness that already writes its conversation to disk
 * has the same content structured, complete, and free of redraw artefacts, so
 * prefer it where it exists and fall back to the stream everywhere else.
 *
 * A harness without an entry keeps its sessions somewhere we cannot inspect
 * (grok's are server-side); the rest are unsurveyed.
 */
export const HARNESS_SESSION_STORES: Partial<
	Record<AgentIdentityId, HarnessSessionStore>
> = {
	claude: claudeSessionStore,
	codex: codexSessionStore,
	opencode: opencodeSessionStore,
	pi: piSessionStore,
};

const SESSION_ID_PATTERN = /^[\w-]+$/;

function storeFor(
	ref: HarnessSessionRef,
): { store: HarnessSessionStore; query: HarnessSessionQuery } | null {
	const { agentId, sessionId } = ref;
	if (!agentId || !sessionId || !SESSION_ID_PATTERN.test(sessionId)) {
		return null;
	}
	const store = HARNESS_SESSION_STORES[agentId as AgentIdentityId];
	if (!store) return null;
	return {
		store,
		query: {
			sessionId,
			worktreePath: ref.worktreePath ?? null,
			env: ref.env,
		},
	};
}

/**
 * The path the harness's own hook reported, when it still names this
 * session's file. A path left behind by an earlier session in the same
 * terminal names a different id and is ignored.
 */
function reportedSessionFile(
	files: HarnessSessionFiles,
	query: HarnessSessionQuery,
	reportedPath: string | null | undefined,
): string | null {
	return reportedPath &&
		isAbsolute(reportedPath) &&
		files.isSessionFile(reportedPath, query.sessionId) &&
		isFile(reportedPath)
		? reportedPath
		: null;
}

export interface HarnessTranscript {
	text: string;
	/** Which harness store answered, for the caller to report. */
	harness: string;
}

/**
 * The harness's own transcript for a session, oldest turns dropped first
 * when it exceeds `maxChars`. Null when the harness keeps none, the session
 * is unknown, or the file cannot be read.
 */
export function readHarnessTranscript(
	ref: HarnessSessionRef,
	maxChars: number,
): HarnessTranscript | null {
	const resolved = storeFor(ref);
	const files = resolved?.store.files;
	const parseTurns = files?.parseTurns;
	if (!resolved || !files || !parseTurns) return null;
	const { query } = resolved;

	const reported = reportedSessionFile(files, query, ref.reportedPath);
	const path = reported ?? files.locate(query);
	if (!path) {
		// A bound session with no file anywhere means the harness moved its
		// store: the handoff silently degrades to the terminal's last moments.
		console.warn(
			`[harness-sessions] no transcript for ${ref.agentId} session ${query.sessionId}; falling back to the terminal stream`,
		);
		return null;
	}
	if (!reported) {
		console.info(
			`[harness-sessions] ${ref.agentId} session ${query.sessionId} found without a reported path`,
		);
	}
	const text = readTurnsFromTail(path, maxChars, parseTurns);
	return text ? { text, harness: ref.agentId ?? "" } : null;
}

/**
 * Whether the harness can still resolve a session id under the ref's env —
 * the env a relaunch or fork will run under, so a path reported by an
 * earlier launch on another account does not count.
 *
 * `true` and `false` are answers; `null` means this harness keeps its sessions
 * somewhere we cannot inspect and the caller must not treat that as absence.
 *
 * Forking a session the provider has pruned fails inside the freshly launched
 * pane, as the harness's own error, long after the click that asked for it.
 * Checking first turns that into a refusal at the point of asking.
 */
export function hasHarnessSession(ref: HarnessSessionRef): boolean | null {
	const resolved = storeFor(ref);
	if (!resolved) return null;
	const { store, query } = resolved;
	try {
		if (store.hasSession) return store.hasSession(query);
		return store.files?.locate(query) ? true : null;
	} catch {
		// An unreadable store is not evidence the session is gone.
		return null;
	}
}
