import type { HarnessSessionQuery, HarnessSessionRef } from "./types";

const SESSION_ID_PATTERN = /^[\w-]+$/;

/** A ref's harness and query, when its session id is safe to put in a path. */
export function toSessionQuery(
	ref: HarnessSessionRef,
): { agentId: string; query: HarnessSessionQuery } | null {
	const { agentId, sessionId } = ref;
	if (!agentId || !sessionId || !SESSION_ID_PATTERN.test(sessionId)) {
		return null;
	}
	return {
		agentId,
		query: {
			sessionId,
			worktreePath: ref.worktreePath ?? null,
			env: ref.env,
		},
	};
}
