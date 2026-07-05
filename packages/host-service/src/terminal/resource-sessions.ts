import type { SessionInfo } from "@superset/pty-daemon/protocol";
import { inArray } from "drizzle-orm";
import type { HostDb } from "../db/index.ts";
import { terminalSessions } from "../db/schema.ts";

export interface TerminalResourceSession {
	terminalId: string;
	workspaceId: string;
	pid: number;
	title: string | null;
}

function isLiveDaemonSession(
	session: SessionInfo,
): session is SessionInfo & { pid: number } {
	return (
		session.alive &&
		typeof session.id === "string" &&
		session.id.length > 0 &&
		typeof session.pid === "number" &&
		Number.isInteger(session.pid) &&
		session.pid > 0
	);
}

export function listTerminalResourceSessions(
	db: HostDb,
	daemonSessions: SessionInfo[],
	titlesByTerminalId: ReadonlyMap<string, string | null> = new Map(),
): TerminalResourceSession[] {
	const liveSessions = daemonSessions.filter(isLiveDaemonSession);
	if (liveSessions.length === 0) return [];

	const rows = db
		.select({
			id: terminalSessions.id,
			originWorkspaceId: terminalSessions.originWorkspaceId,
			status: terminalSessions.status,
		})
		.from(terminalSessions)
		.where(
			inArray(
				terminalSessions.id,
				liveSessions.map((session) => session.id),
			),
		)
		.all();

	const rowById = new Map(rows.map((row) => [row.id, row]));

	return liveSessions.flatMap((session) => {
		const row = rowById.get(session.id);
		if (
			!row ||
			row.status !== "active" ||
			typeof row.originWorkspaceId !== "string" ||
			row.originWorkspaceId.length === 0
		) {
			return [];
		}

		return [
			{
				terminalId: session.id,
				workspaceId: row.originWorkspaceId,
				pid: session.pid,
				title: titlesByTerminalId.get(session.id) ?? null,
			},
		];
	});
}
