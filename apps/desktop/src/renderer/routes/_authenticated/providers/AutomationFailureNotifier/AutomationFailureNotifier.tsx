"use client";

import type { AutomationRunStatus } from "@superset/db/schema";
import { eq, or } from "@tanstack/db";
import { useLiveQuery } from "@tanstack/react-db";
import { useNavigate } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { electronTrpcClient } from "renderer/lib/trpc-client";
import { useCollections } from "../CollectionsProvider";

/**
 * AutomationFailureNotifier
 *
 * Monitors automation runs for dispatch_failed and skipped_offline status transitions.
 * When a run enters one of these failure states, it dispatches an IPC mutation to the
 * main process to fire an OS notification. De-duplication ensures exactly one
 * notification per (runId, status) pair.
 *
 * This is a null-rendering provider component — it has no UI.
 */
export function AutomationFailureNotifier() {
	const navigate = useNavigate();
	const collections = useCollections();

	// Track last seen status per run ID to detect transitions
	const statusMapRef = useRef<Map<string, AutomationRunStatus>>(new Map());

	// Query for runs in failure states
	const { data: failedRuns = [] } = useLiveQuery(
		(q) =>
			q
				.from({ r: collections.automationRuns })
				.where(({ r }) =>
					or(eq(r.status, "dispatch_failed"), eq(r.status, "skipped_offline")),
				)
				.orderBy(({ r }) => r.createdAt, "desc")
				.select(({ r }) => ({ ...r })),
		[collections.automationRuns],
	);

	// Fire notifications on status transitions
	useEffect(() => {
		const statusMap = statusMapRef.current;

		for (const run of failedRuns) {
			const prevStatus = statusMap.get(run.id);

			// Only fire notification if status is new for this run
			if (prevStatus !== run.status) {
				// Fire the notification via main process
				electronTrpcClient.notifications.fireAutomationFailure.mutate({
					runId: run.id,
					automationId: run.automationId,
					title: run.title ?? "Automation",
					error: run.error ?? "Automation failed (no details)",
				});

				// Update the map to prevent duplicate notifications
				statusMap.set(run.id, run.status);
			}
		}
	}, [failedRuns]);

	// Register listener for nav:automation-run IPC events
	useEffect(() => {
		const ipcRenderer = window.ipcRenderer as
			| typeof window.ipcRenderer
			| undefined;
		if (!ipcRenderer) return;

		const handler = (data: { automationId: string; runId: string }) => {
			// Navigate to the failing automation page
			navigate({
				to: "/automations/$automationId",
				params: { automationId: data.automationId },
			});
		};

		// Listen for the navigation event from the notification click
		ipcRenderer.on("nav:automation-run", handler);

		return () => {
			ipcRenderer.off("nav:automation-run", handler);
		};
	}, [navigate]);

	// This component renders nothing
	return null;
}
