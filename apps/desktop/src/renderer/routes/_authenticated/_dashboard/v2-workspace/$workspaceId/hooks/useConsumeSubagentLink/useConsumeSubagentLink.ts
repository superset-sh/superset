import type { WorkspaceStore } from "@superset/panes";
import { useEffect, useRef } from "react";
import type { SubagentLinkParams } from "renderer/routes/_authenticated/_dashboard/utils/workspace-navigation";
import type { StoreApi } from "zustand/vanilla";
import type { PaneViewerData } from "../../types";
import { openSubagentPaneInStore } from "../../utils/openSubagentPaneInStore";

interface UseConsumeSubagentLinkArgs {
	store: StoreApi<WorkspaceStore<PaneViewerData>>;
	isLayoutReady: boolean;
	link: SubagentLinkParams | undefined;
	focusRequestId: string | undefined;
}

/**
 * Opens the subagent transcript pane named by the workspace's search params,
 * the way the sidebar's agents chip deep-links into a workspace it cannot
 * reach the pane store of. Each request id is consumed once so a re-render
 * does not reopen the pane.
 */
export function useConsumeSubagentLink({
	store,
	isLayoutReady,
	link,
	focusRequestId,
}: UseConsumeSubagentLinkArgs): void {
	const consumedRef = useRef<Set<string>>(new Set());
	useEffect(() => {
		if (!isLayoutReady || !link) return;
		const key = `${link.terminalId}:${link.subagentId}:${focusRequestId ?? ""}`;
		if (consumedRef.current.has(key)) return;
		consumedRef.current.add(key);
		openSubagentPaneInStore(store, link);
	}, [store, isLayoutReady, link, focusRequestId]);
}
