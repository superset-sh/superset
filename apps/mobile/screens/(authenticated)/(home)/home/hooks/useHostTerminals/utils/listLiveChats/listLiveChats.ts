import type { ChatTransport } from "@superset/chat/client";

export interface LiveChat {
	sessionId: string;
	workspaceId: string;
	harness: string;
	title: string | null;
	status: string;
	updatedAt: number;
}

const LIST_LIMIT = 200;
const PROBE_LIMIT = 10;

/**
 * The host's chats that still have an agent behind them. A host from before
 * `listSessions` reported `live` is asked per session instead, newest first,
 * since a closed chat keeps its last status forever.
 */
export async function listLiveChats(
	transport: Pick<ChatTransport, "listSessions" | "getSession">,
): Promise<LiveChat[]> {
	const rows = await transport.listSessions({ limit: LIST_LIMIT });
	const reportsLive = rows.some((row) => typeof row.live === "boolean");
	const live = reportsLive
		? rows.filter((row) => row.live)
		: await probeLive(
				transport,
				rows.filter((row) => row.status !== "dead").slice(0, PROBE_LIMIT),
			);
	return live.map((row) => ({
		sessionId: row.sessionId,
		workspaceId: row.scopeId,
		harness: row.harness,
		title: row.title,
		status: row.status,
		updatedAt: row.updatedAt,
	}));
}

async function probeLive<Row extends { sessionId: string }>(
	transport: Pick<ChatTransport, "getSession">,
	rows: Row[],
): Promise<Row[]> {
	const answers = await Promise.all(
		rows.map((row) =>
			transport
				.getSession({ sessionId: row.sessionId })
				.then((result) => result.live)
				.catch(() => false),
		),
	);
	return rows.filter((_, index) => answers[index]);
}
