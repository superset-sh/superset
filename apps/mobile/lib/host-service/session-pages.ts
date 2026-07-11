import type {
	SessionMessage,
	SessionScopedState,
	SessionsApi,
} from "@superset/session-protocol";

const PAGE_SIZE = 200;
const MAX_PAGES = 1_000;

/** Restores the SDK transcript's chronological order across opaque pages. */
export async function loadSessionHistory(
	api: Pick<SessionsApi, "getMessages">,
	sessionId: string,
): Promise<SessionMessage[]> {
	let cursor: string | undefined;
	const seenCursors = new Set<string>();
	let messages: SessionMessage[] = [];

	for (let pageNumber = 0; pageNumber < MAX_PAGES; pageNumber += 1) {
		const page = await api.getMessages({
			sessionId,
			...(cursor ? { cursor } : {}),
			limit: PAGE_SIZE,
		});
		messages = [...page.items, ...messages];
		if (!page.nextCursor) return messages;
		if (seenCursors.has(page.nextCursor)) {
			throw new Error("Session history returned a repeated cursor");
		}
		seenCursors.add(page.nextCursor);
		cursor = page.nextCursor;
	}

	throw new Error("Session history exceeded the pagination safety limit");
}

/** Reads the complete host-local live-session directory without truncation. */
export async function loadWorkspaceClaudeSessions(
	api: Pick<SessionsApi, "list">,
	workspaceId: string,
): Promise<SessionScopedState[]> {
	let cursor: string | undefined;
	const seenCursors = new Set<string>();
	const seenSessionIds = new Set<string>();
	const sessions: SessionScopedState[] = [];

	for (let pageNumber = 0; pageNumber < MAX_PAGES; pageNumber += 1) {
		const page = await api.list({
			workspaceId,
			...(cursor ? { cursor } : {}),
			limit: PAGE_SIZE,
		});
		for (const session of page.items) {
			if (seenSessionIds.has(session.sessionId)) continue;
			seenSessionIds.add(session.sessionId);
			sessions.push(session);
		}
		if (!page.nextCursor) return sessions;
		if (seenCursors.has(page.nextCursor)) {
			throw new Error("Session directory returned a repeated cursor");
		}
		seenCursors.add(page.nextCursor);
		cursor = page.nextCursor;
	}

	throw new Error("Session directory exceeded the pagination safety limit");
}
