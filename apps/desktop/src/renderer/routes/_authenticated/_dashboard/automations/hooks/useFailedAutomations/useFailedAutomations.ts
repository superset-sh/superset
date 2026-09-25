import type { SelectAutomationRun } from "@superset/db/schema";
import { useMemo } from "react";
import { cloudTrpc } from "renderer/lib/cloud-trpc";

const LATEST_RUNS_POLL_MS = 120_000;

const FAILED_STATUSES: SelectAutomationRun["status"][] = [
	"skipped_offline",
	"dispatch_failed",
];

export interface AutomationLastRun {
	status: SelectAutomationRun["status"];
	/** createdAt as epoch ms; NaN-free (unparseable rows are dropped). */
	at: number;
	v2WorkspaceId: string | null;
	chatSessionId: string | null;
	terminalSessionId: string | null;
}

interface FailedAutomations {
	/** Most recent run per automation, with its workspace/session links. */
	lastRunById: Map<string, AutomationLastRun>;
	/** Automations whose most recent run failed. */
	failedIds: Set<string>;
}

export function useFailedAutomations(): FailedAutomations {
	const { data: runRows = [] } = cloudTrpc.automation.latestRuns.useQuery(
		undefined,
		{ refetchInterval: LATEST_RUNS_POLL_MS, staleTime: 30_000 },
	);

	return useMemo(() => {
		const lastRunById = new Map<string, AutomationLastRun>();
		for (const run of runRows) {
			const at = new Date(run.createdAt).getTime();
			if (!Number.isFinite(at)) continue;
			lastRunById.set(run.automationId, {
				status: run.status,
				at,
				v2WorkspaceId: run.v2WorkspaceId ?? null,
				chatSessionId: run.chatSessionId ?? null,
				terminalSessionId: run.terminalSessionId ?? null,
			});
		}
		const failedIds = new Set<string>();
		for (const [id, run] of lastRunById) {
			if (FAILED_STATUSES.includes(run.status)) failedIds.add(id);
		}
		return { lastRunById, failedIds };
	}, [runRows]);
}
