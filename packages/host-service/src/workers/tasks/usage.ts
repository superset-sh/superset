// usage/* worker tasks. History computation walks and parses multi-GB
// transcript trees (~/.claude/projects, $CODEX_HOME/sessions), so both the
// I/O and the JSON.parse work must stay off the host-service event loop.

import type {
	CwdLabel,
	UsageHistory,
} from "../../trpc/router/usage/history/aggregate.ts";
import { computeUsageHistory } from "../../trpc/router/usage/history/aggregate.ts";
import { defineWorkerTask } from "../define-worker-task.ts";

export const usageHistoryTask = defineWorkerTask<
	{ days: number; cwdLabels: CwdLabel[] },
	UsageHistory
>({
	type: "usage/history",
	handler: ({ days, cwdLabels }) => computeUsageHistory(days, cwdLabels),
});

export const usageTasks = [usageHistoryTask];
