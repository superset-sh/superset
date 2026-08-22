import type { WorkspaceStore } from "@superset/panes";
import { workspaceTrpc } from "@superset/workspace-client";
import { useEffect, useRef } from "react";
import type { StoreApi } from "zustand/vanilla";
import type { PaneViewerData } from "../../types";
import { focusOrAddTerminalPane } from "../../utils/focusTerminalPane";

interface UseConsumeAutomationRunLinkArgs {
	store: StoreApi<WorkspaceStore<PaneViewerData>>;
	workspaceId: string;
	terminalId: string | undefined;
	focusRequestId: string | undefined;
}

/**
 * When the workspace is opened via a deep link from an automation run
 * (`?terminalId=...`), ensure the corresponding pane is present and focused.
 * The underlying session already exists on the host-service from the
 * dispatcher — we just re-adopt it in the pane store.
 */
export function useConsumeAutomationRunLink({
	store,
	workspaceId,
	terminalId,
	focusRequestId,
}: UseConsumeAutomationRunLinkArgs): void {
	const consumedRef = useRef<Set<string>>(new Set());
	const terminalSessionsQuery = workspaceTrpc.terminal.list.useQuery(
		{ workspaceId },
		{
			enabled: terminalId != null,
			refetchOnWindowFocus: false,
		},
	);
	useEffect(() => {
		if (!terminalId) return;
		if (!terminalSessionsQuery.isSuccess) return;
		const key = getAutomationRunLinkConsumeKey({
			type: "terminal",
			id: terminalId,
			focusRequestId,
		});
		if (consumedRef.current.has(key)) return;
		consumedRef.current.add(key);
		if (
			!terminalSessionBelongsToWorkspace({
				sessions: terminalSessionsQuery.data.sessions,
				terminalId,
				workspaceId,
			})
		) {
			console.warn(
				"[automation-run-link] Ignoring terminal link for another workspace",
				{ terminalId, workspaceId },
			);
			return;
		}
		focusOrAddTerminalPane(store, terminalId);
	}, [
		store,
		terminalId,
		focusRequestId,
		terminalSessionsQuery.isSuccess,
		terminalSessionsQuery.data,
		workspaceId,
	]);
}

export function getAutomationRunLinkConsumeKey({
	type,
	id,
	focusRequestId,
}: {
	type: "terminal";
	id: string;
	focusRequestId: string | undefined;
}): string {
	return focusRequestId
		? `${type}:${id}:focus:${focusRequestId}`
		: `${type}:${id}`;
}

export function terminalSessionBelongsToWorkspace({
	sessions,
	terminalId,
	workspaceId,
}: {
	sessions: Array<{ terminalId: string; workspaceId: string }>;
	terminalId: string;
	workspaceId: string;
}): boolean {
	return sessions.some(
		(session) =>
			session.terminalId === terminalId && session.workspaceId === workspaceId,
	);
}
