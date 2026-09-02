// usage/* worker tasks. History computation walks and parses multi-GB
// transcript trees (~/.claude/projects, $CODEX_HOME/sessions), so both the
// I/O and the JSON.parse work must stay off the host-service event loop.

import type {
	CwdLabel,
	UsageHistory,
} from "../../trpc/router/usage/history/aggregate.ts";
import { computeUsageHistory } from "../../trpc/router/usage/history/aggregate.ts";
import type { LeaderboardPayload } from "../../trpc/router/usage/history/leaderboard-days.ts";
import { computeLeaderboardPayload } from "../../trpc/router/usage/history/leaderboard-days.ts";
import { defineWorkerTask } from "../define-worker-task.ts";

export const usageHistoryTask = defineWorkerTask<
	{ days: number; cwdLabels: CwdLabel[] },
	UsageHistory
>({
	type: "usage/history",
	handler: ({ days, cwdLabels }) => computeUsageHistory(days, cwdLabels),
});

export const leaderboardPayloadTask = defineWorkerTask<
	{ days: number; nowMs: number; agentPrsByDay: Record<string, number> },
	LeaderboardPayload
>({
	type: "usage/leaderboard-payload",
	handler: ({ days, nowMs, agentPrsByDay }) =>
		computeLeaderboardPayload(days, agentPrsByDay, new Date(nowMs)),
});

export const usageTasks = [usageHistoryTask, leaderboardPayloadTask];
