import type { SelectAutomationRun } from "@superset/db/schema";
import { useLiveQuery } from "@tanstack/react-db";
import { useCallback, useMemo } from "react";
import { authClient } from "renderer/lib/auth-client";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import { useAutomationFailuresStore } from "renderer/stores/automation-failures";

const FAILED_STATUSES: SelectAutomationRun["status"][] = [
	"skipped_offline",
	"dispatch_failed",
];

interface FailedAutomations {
	/** Most recent run status per automation (absent = no runs yet). */
	lastRunStatusById: Map<string, SelectAutomationRun["status"]>;
	/** Automations whose most recent run failed. */
	failedIds: Set<string>;
	/** How many of the current user's failures the user hasn't seen yet. */
	myFailedCount: number;
	/** Clear the failure badge by acknowledging the user's current failures. */
	markMyFailuresSeen: () => void;
}

export function useFailedAutomations(): FailedAutomations {
	const collections = useCollections();
	const { data: session } = authClient.useSession();
	const currentUserId = session?.user?.id;
	const lastSeenFailureAt = useAutomationFailuresStore(
		(s) => s.lastSeenFailureAt,
	);
	const markFailuresSeen = useAutomationFailuresStore(
		(s) => s.markFailuresSeen,
	);

	const { data: runRows = [] } = useLiveQuery(
		(q) =>
			q.from({ r: collections.automationRuns }).select(({ r }) => ({
				automationId: r.automationId,
				status: r.status,
				createdAt: r.createdAt,
			})),
		[collections.automationRuns],
	);
	const { data: automationRows = [] } = useLiveQuery(
		(q) =>
			q.from({ a: collections.automations }).select(({ a }) => ({
				id: a.id,
				ownerUserId: a.ownerUserId,
			})),
		[collections.automations],
	);

	const { lastRunStatusById, failedIds, myFailureTimes } = useMemo(() => {
		const latest = new Map<
			string,
			{ status: SelectAutomationRun["status"]; at: number }
		>();
		for (const run of runRows) {
			if (run == null) continue;
			const at = new Date(run.createdAt as unknown as string).getTime();
			const prev = latest.get(run.automationId);
			if (!prev || at > prev.at) {
				latest.set(run.automationId, { status: run.status, at });
			}
		}
		const lastRunStatusById = new Map<string, SelectAutomationRun["status"]>();
		const failedIds = new Set<string>();
		for (const [id, run] of latest) {
			lastRunStatusById.set(id, run.status);
			if (FAILED_STATUSES.includes(run.status)) failedIds.add(id);
		}
		// createdAt of each of the current user's failing runs.
		const myFailureTimes = currentUserId
			? automationRows
					.filter(
						(a) =>
							a != null &&
							a.ownerUserId === currentUserId &&
							failedIds.has(a.id),
					)
					.map((a) => latest.get(a.id)?.at ?? 0)
			: [];
		return { lastRunStatusById, failedIds, myFailureTimes };
	}, [runRows, automationRows, currentUserId]);

	const myFailedCount = useMemo(
		() => myFailureTimes.filter((at) => at > lastSeenFailureAt).length,
		[myFailureTimes, lastSeenFailureAt],
	);

	const markMyFailuresSeen = useCallback(() => {
		const newest = myFailureTimes.reduce((max, at) => Math.max(max, at), 0);
		if (newest > 0) markFailuresSeen(newest);
	}, [myFailureTimes, markFailuresSeen]);

	return { lastRunStatusById, failedIds, myFailedCount, markMyFailuresSeen };
}
