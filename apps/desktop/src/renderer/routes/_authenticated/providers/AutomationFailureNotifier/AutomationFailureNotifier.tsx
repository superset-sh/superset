import { useLiveQuery } from "@tanstack/react-db";
import { eq, or } from "drizzle-orm";
import { useEffect, useRef } from "react";
import { electronTrpcClient } from "renderer/lib/trpc-client";
import { useCollections } from "../CollectionsProvider";

export function AutomationFailureNotifier() {
	const collections = useCollections();
	const notifiedRunIdsRef = useRef<Set<string>>(new Set());

	const { data: automationRuns = [] } = useLiveQuery(
		(q) =>
			q
				.from({ automationRuns: collections.automationRuns })
				.select(({ automationRuns: ar }) => ({
					id: ar.id,
					title: ar.title,
					status: ar.status,
					error: ar.error,
				}))
				.where(({ automationRuns: ar }) =>
					or(
						eq(ar.status, "dispatch_failed"),
						eq(ar.status, "skipped_offline"),
					),
				),
		[collections],
	);

	useEffect(() => {
		if (!automationRuns || automationRuns.length === 0) {
			return;
		}

		for (const run of automationRuns) {
			if (notifiedRunIdsRef.current.has(run.id)) continue;

			electronTrpcClient.notifications.showNative
				.mutate({
					title: "Automation failed",
					body: run.error || "Run failed",
				})
				.then(() => {
					notifiedRunIdsRef.current.add(run.id);
				})
				.catch(() => {
					// IPC call failed — don't mark as notified so it retries next effect run
				});
		}
	}, [automationRuns]);

	return null;
}
