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
 * dispatcher — we just re-adopt it in the pane store. A run whose agent was
 * since relaunched into a fresh terminal (an account-switch restart) is
 * followed to that terminal, so the link still lands on the conversation.
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
	const linkedTerminalIsLive =
		terminalId != null &&
		terminalSessionsQuery.isSuccess &&
		terminalSessionBelongsToWorkspace({
			sessions: terminalSessionsQuery.data.sessions,
			terminalId,
			workspaceId,
		});
	// Only a dead link is worth a successor lookup — the live case is the
	// common one and needs nothing more than the session list.
	const successorQuery = workspaceTrpc.terminalAgents.resumedSuccessor.useQuery(
		{ workspaceId, terminalId: terminalId ?? "" },
		{
			enabled:
				terminalId != null &&
				terminalSessionsQuery.isSuccess &&
				!linkedTerminalIsLive,
			refetchOnWindowFocus: false,
		},
	);
	const targetTerminalId = resolveAutomationRunLinkTarget({
		terminalId,
		linkedTerminalIsLive,
		successor: successorQuery.isSuccess
			? (successorQuery.data?.terminalId ?? null)
			: undefined,
	});
	useEffect(() => {
		if (!terminalId) return;
		// undefined = still resolving; null = resolved to nothing.
		if (targetTerminalId === undefined) return;
		const key = getAutomationRunLinkConsumeKey({
			type: "terminal",
			id: terminalId,
			focusRequestId,
		});
		if (consumedRef.current.has(key)) return;
		consumedRef.current.add(key);
		if (targetTerminalId === null) {
			console.warn(
				"[automation-run-link] Ignoring terminal link for another workspace",
				{ terminalId, workspaceId },
			);
			return;
		}
		focusOrAddTerminalPane(store, targetTerminalId);
	}, [store, terminalId, focusRequestId, targetTerminalId, workspaceId]);
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

/**
 * The terminal a run link should land on: the linked one while it lives,
 * otherwise the terminal its session was resumed into. `undefined` while the
 * successor is still being looked up; `null` once there is nothing to open.
 */
export function resolveAutomationRunLinkTarget({
	terminalId,
	linkedTerminalIsLive,
	successor,
}: {
	terminalId: string;
	linkedTerminalIsLive: boolean;
	successor: string | null | undefined;
}): string | null | undefined {
	if (linkedTerminalIsLive) return terminalId;
	return successor;
}
