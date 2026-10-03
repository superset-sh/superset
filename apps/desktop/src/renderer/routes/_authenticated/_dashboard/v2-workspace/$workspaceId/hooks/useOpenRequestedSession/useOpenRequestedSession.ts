import type { WorkspaceStore } from "@superset/panes";
import { useEffect } from "react";
import { useOpenSessionIntent } from "renderer/stores/open-session-intent";
import type { StoreApi } from "zustand/vanilla";
import type { PaneViewerData } from "../../types";
import { focusOrAddTerminalPane } from "../../utils/focusTerminalPane";

interface UseOpenRequestedSessionArgs {
	store: StoreApi<WorkspaceStore<PaneViewerData>>;
	workspaceId: string;
	isLayoutReady: boolean;
}

/**
 * Opens the terminal a Sessions-list row asked for, once this workspace's
 * pane layout has hydrated. Gated on hydration for the same reason adoption
 * is: focusing against an empty store would add a duplicate pane for a
 * terminal the layout already holds. The request is claimed, so a later
 * visit to the same workspace does not reopen it.
 */
export function useOpenRequestedSession({
	store,
	workspaceId,
	isLayoutReady,
}: UseOpenRequestedSessionArgs): void {
	const requested = useOpenSessionIntent(
		(state) => state.requests[workspaceId],
	);

	useEffect(() => {
		if (!isLayoutReady || !requested) return;
		const terminalId = useOpenSessionIntent.getState().claim(workspaceId);
		if (!terminalId) return;
		focusOrAddTerminalPane(store, terminalId);
	}, [isLayoutReady, requested, store, workspaceId]);
}
