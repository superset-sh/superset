import type { SelectAutomationRun } from "@superset/db/schema";
import { useCallback, useMemo } from "react";
import { authClient } from "renderer/lib/auth-client";
import { cloudTrpc } from "renderer/lib/cloud-trpc";
import { useAutomationFailuresStore } from "renderer/stores/automation-failures";

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
	/** Most recent run status per automation (absent = no runs yet). */
	lastRunStatusById: Map<string, SelectAutomationRun["status"]>;
	/** Most recent run per automation, with its workspace/session links. */
	lastRunById: Map<string, AutomationLastRun>;
	/** Automations whose most recent run failed. */
	failedIds: Set<string>;
	/** How many of the current user's failures the user hasn't seen yet. */
	myFailedCount: number;
	/** Clear the failure badge by acknowledging the user's current failures. */
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
		{ refetchInterval: 30_000, staleTime: 30_000 },
	);
	const { data: automationRows = [] } = cloudTrpc.automation.list.useQuery(
		undefined,
		{ refetchInterval: 30_000, staleTime: 30_000 },
	);

	const { lastRunStatusById, lastRunById, failedIds, myFailureTimes } =
		useMemo(() => {
			const latest = new Map<string, AutomationLastRun>();
			for (const run of runRows) {
				const at = new Date(run.createdAt).getTime();
				if (!Number.isFinite(at)) continue;
				latest.set(run.automationId, {
					status: run.status,
					at,
					v2WorkspaceId: run.v2WorkspaceId ?? null,
					chatSessionId: run.chatSessionId ?? null,
					terminalSessionId: run.terminalSessionId ?? null,
				});
			}
			const lastRunStatusById = new Map<
				string,
				SelectAutomationRun["status"]
			>();
			const failedIds = new Set<string>();
			for (const [id, run] of latest) {
				lastRunStatusById.set(id, run.status);
				if (FAILED_STATUSES.includes(run.status)) failedIds.add(id);
			}
			// createdAt of each of the current user's failing runs.
			const myFailureTimes = currentUserId
				? automationRows
						.filter(
							(a) => a.ownerUserId === currentUserId && failedIds.has(a.id),
						)
						.map((a) => latest.get(a.id)?.at ?? 0)
						.filter((at) => Number.isFinite(at))
				: [];
			return {
				lastRunStatusById,
				lastRunById: latest,
				failedIds,
				myFailureTimes,
			};
		}, [runRows, automationRows, currentUserId]);

	const myFailedCount = useMemo(
		() => myFailureTimes.filter((at) => at > lastSeenFailureAt).length,
		[myFailureTimes, lastSeenFailureAt],
	);

	const markMyFailuresSeen = useCallback(() => {
		const newest = myFailureTimes.reduce((max, at) => Math.max(max, at), 0);
		if (newest > 0) markFailuresSeen(newest);
	}, [myFailureTimes, markFailuresSeen]);

	return {
		lastRunStatusById,
		lastRunById,
		failedIds,
		myFailedCount,
		markMyFailuresSeen,
	};
}
