import type { SelectAutomationRun } from "@superset/db/schema";
import { useCallback, useMemo } from "react";
import { authClient } from "renderer/lib/auth-client";
import { cloudTrpc } from "renderer/lib/cloud-trpc";
import { useAutomationFailuresStore } from "renderer/stores/automation-failures";

// Realtime nudges keep it current; this bounds staleness from a missed one.
const LATEST_RUNS_STALE_MS = 10 * 60_000;

const FAILED_STATUSES: SelectAutomationRun["status"][] = [
	"skipped_offline",
	"dispatch_failed",
];

export interface AutomationLastRun {
	status: SelectAutomationRun["status"];
	/** createdAt as epoch ms; NaN-free (unparseable rows are dropped). */
	at: number;
	/** The run's host or cloud workspace; both open at the same route. */
	workspaceId: string | null;
	chatSessionId: string | null;
	terminalSessionId: string | null;
}

interface FailedAutomations {
	/** Most recent run per automation, with its workspace/session links. */
	lastRunById: Map<string, AutomationLastRun>;
	/** Automations whose most recent run failed. */
	failedIds: Set<string>;
	/** How many of the current user's failures the user hasn't seen yet. */
	myFailedCount: number;
	markMyFailuresSeen: () => void;
}

export function useFailedAutomations(): FailedAutomations {
	const { data: session } = authClient.useSession();
	const currentUserId = session?.user?.id;
	const lastSeenFailureAt = useAutomationFailuresStore(
		(s) => s.lastSeenFailureAt,
	);
	const markFailuresSeen = useAutomationFailuresStore(
		(s) => s.markFailuresSeen,
	);

	const { data: runRows = [] } = cloudTrpc.automation.latestRuns.useQuery(
		undefined,
		{ staleTime: LATEST_RUNS_STALE_MS },
	);

	const { lastRunById, failedIds, myFailureTimes } = useMemo(() => {
		const lastRunById = new Map<string, AutomationLastRun>();
		const failedIds = new Set<string>();
		const myFailureTimes: number[] = [];
		for (const run of runRows) {
			const at = new Date(run.createdAt).getTime();
			if (!Number.isFinite(at)) continue;
			lastRunById.set(run.automationId, {
				status: run.status,
				at,
				workspaceId: run.v2WorkspaceId ?? run.cloudWorkspaceId ?? null,
				chatSessionId: run.chatSessionId ?? null,
				terminalSessionId: run.terminalSessionId ?? null,
			});
			if (!FAILED_STATUSES.includes(run.status)) continue;
			failedIds.add(run.automationId);
			if (currentUserId && run.ownerUserId === currentUserId) {
				myFailureTimes.push(at);
			}
		}
		return { lastRunById, failedIds, myFailureTimes };
	}, [runRows, currentUserId]);

	const myFailedCount = useMemo(
		() => myFailureTimes.filter((at) => at > lastSeenFailureAt).length,
		[myFailureTimes, lastSeenFailureAt],
	);

	const markMyFailuresSeen = useCallback(() => {
		const newest = Math.max(0, ...myFailureTimes);
		if (newest > 0) markFailuresSeen(newest);
	}, [myFailureTimes, markFailuresSeen]);

	return { lastRunById, failedIds, myFailedCount, markMyFailuresSeen };
}
