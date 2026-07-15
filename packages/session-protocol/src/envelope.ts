import type { RequestPermissionOutcome, SessionUpdate } from "./acp";
import type { PendingPermission, SessionScopedState } from "./state";

export type SessionUpdateFrame =
	/** An ACP session/update notification, verbatim. */
	| { kind: "update"; update: SessionUpdate }
	| { kind: "permission_requested"; pending: PendingPermission }
	| {
			kind: "permission_resolved";
			requestId: string;
			outcome: RequestPermissionOutcome;
	  }
	/**
	 * The session/prompt request itself failed after the user's message was
	 * journaled — fold marks that message as failed instead of leaving it
	 * looking delivered.
	 */
	| { kind: "prompt_rejected"; reason: string; promptStartSeq: number }
	/** Full state snapshot, emitted whenever session-scoped state changes. */
	| { kind: "state"; state: SessionScopedState }
	/** The requested cursor is unservable — client must resync. */
	| { kind: "reset"; reason: string };

export interface SessionUpdateEnvelope {
	/** Per-session, monotonic from 1, gapless. */
	seq: number;
	sessionId: string;
	ts: number;
	frame: SessionUpdateFrame;
}
