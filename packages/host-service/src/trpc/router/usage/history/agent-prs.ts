import { and, eq, gte, isNotNull } from "drizzle-orm";
import type { HostDb } from "../../../../db";
import {
	pullRequests,
	terminalAgentBindings,
	workspacePullRequests,
} from "../../../../db/schema";
import { utcMidnightCutoff } from "./leaderboard-days";

export function countAgentPrsByDay(
	db: HostDb,
	days: number,
	now: Date = new Date(),
): Record<string, number> {
	const cutoff = utcMidnightCutoff(days, now);

	const rows = db
		.selectDistinct({
			pullRequestId: pullRequests.id,
			mergedAt: pullRequests.mergedAt,
		})
		.from(pullRequests)
		.innerJoin(
			workspacePullRequests,
			eq(workspacePullRequests.pullRequestId, pullRequests.id),
		)
		.innerJoin(
			terminalAgentBindings,
			eq(terminalAgentBindings.workspaceId, workspacePullRequests.workspaceId),
		)
		.where(
			and(isNotNull(pullRequests.mergedAt), gte(pullRequests.mergedAt, cutoff)),
		)
		.all();

	const byDay: Record<string, number> = {};
	for (const row of rows) {
		if (row.mergedAt == null) continue;
		const day = new Date(row.mergedAt).toISOString().slice(0, 10);
		byDay[day] = (byDay[day] ?? 0) + 1;
	}
	return byDay;
}
