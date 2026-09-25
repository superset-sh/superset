import type { AgentIdentityId } from "@superset/shared/agent-catalog";
import { isTrustedTranscriptPath } from "../transcript-path";
import { claudeSessionStore } from "./claude";
import { codexSessionStore } from "./codex";
import { fileHeadIncludes } from "./file-head";
import { isFile } from "./is-file";
import { opencodeSessionStore } from "./opencode";
import { piSessionStore } from "./pi";
import { readTurnsFromTail } from "./tail";
import type {
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
 * How far into a reported file its session id must appear. Every Claude line
 * and Codex's opening session_meta carry it; this is generous for a first
 * line swollen by pasted content.
 */
const REPORTED_FILE_ID_WINDOW_BYTES = 1024 * 1024;

/**
 * The path the harness's own hook reported, when it is still a transcript
 * file of this session. It is exact however the harness lays out its store,
 * even under a name that is not the id. The hook endpoint is
 * unauthenticated, so the file must name the session itself before it is
 * read into another agent's prompt.
 */
function reportedSessionFile(
	reportedPath: string | null | undefined,
	sessionId: string,
): string | null {
	return reportedPath &&
		isTrustedTranscriptPath(reportedPath) &&
		isFile(reportedPath) &&
		fileHeadIncludes(reportedPath, sessionId, REPORTED_FILE_ID_WINDOW_BYTES)
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

	let reported: string | null;
	let path: string | null;
	try {
		reported = reportedSessionFile(ref.reportedPath, query.sessionId);
		path = reported ?? files.locate(query);
	} catch (error) {
		// An unreadable store must not fail the handoff; the stream answers.
		console.warn(
			`[harness-sessions] could not look up ${ref.agentId} session ${query.sessionId}:`,
			error,
		);
		return null;
	}
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
