import type { WorkspaceStore } from "@superset/panes";
import type { AgentIdentityId } from "@superset/shared/agent-catalog";
import { useEffect, useRef } from "react";
import type { StoreApi } from "zustand/vanilla";
import type { PaneViewerData } from "../../types";
import { openSubagentPaneInStore } from "../../utils/openSubagentPaneInStore";

interface UseConsumeSubagentLinkArgs {
	store: StoreApi<WorkspaceStore<PaneViewerData>>;
	isLayoutReady: boolean;
	terminalId: string | undefined;
	subagentId: string | undefined;
	agentId: string | undefined;
	agentType: string | undefined;
	focusRequestId: string | undefined;
}

/**
 * Opens the subagent transcript pane named by the workspace's search params
 * (`?subagentTerminalId=…&subagentId=…`), the way the sidebar's agents chip
 * deep-links into a workspace it cannot reach the pane store of. Each
 * request id is consumed once so a re-render does not reopen the pane.
 */
export function useConsumeSubagentLink({
	store,
	isLayoutReady,
	terminalId,
	subagentId,
	agentId,
	agentType,
	focusRequestId,
}: UseConsumeSubagentLinkArgs): void {
	const consumedRef = useRef<Set<string>>(new Set());
	useEffect(() => {
		if (!isLayoutReady || !terminalId || !subagentId || !agentId) return;
		const key = `${terminalId}:${subagentId}:${focusRequestId ?? ""}`;
		if (consumedRef.current.has(key)) return;
		consumedRef.current.add(key);
		openSubagentPaneInStore(store, {
			terminalId,
			subagentId,
			agentId: agentId as AgentIdentityId,
			...(agentType ? { agentType } : {}),
		});
	}, [
		store,
		isLayoutReady,
		terminalId,
		subagentId,
		agentId,
		agentType,
		focusRequestId,
	]);
}
