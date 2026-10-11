import type { WorkspaceState } from "@superset/panes";
import type {
	PaneLayoutOp,
	PaneLayoutOpResult,
} from "@superset/shared/pane-layout-ops";
import { useEffect } from "react";
import { markTerminalForBackground } from "renderer/lib/terminal/terminal-background-intents";
import { electronTrpcClient } from "renderer/lib/trpc-client";
import type { PaneViewerData } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/types";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import type { AppCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider/collections";
import { getV2PaneLayoutStore } from "renderer/stores/v2-pane-layout-stores";
import {
	applyRememberedV2PaneSelection,
	rememberV2PaneSelection,
} from "renderer/stores/v2-pane-selection";
import {
	applyPaneLayoutOp,
	PaneLayoutOpError,
} from "./utils/applyPaneLayoutOp";
import { describePaneLayout } from "./utils/describePaneLayout";

const EMPTY_LAYOUT: WorkspaceState<PaneViewerData> = {
	version: 1,
	tabs: [],
	activeTabId: null,
};

/** Keeps a terminal closed with `keepTerminal` from being re-adopted into a new tab. */
function backgroundClosedTerminal(
	state: WorkspaceState<PaneViewerData>,
	workspaceId: string,
	op: PaneLayoutOp,
): void {
	if (op.type !== "close" || !op.keepTerminal) return;
	for (const tab of state.tabs) {
		const pane = tab.panes[op.paneId];
		if (pane?.kind === "terminal") {
			const { terminalId } = pane.data as { terminalId: string };
			markTerminalForBackground(terminalId, workspaceId);
			return;
		}
	}
}

function runPaneLayoutOp(
	collections: Pick<AppCollections, "v2WorkspaceLocalState">,
	workspaceId: string,
	op: PaneLayoutOp,
): PaneLayoutOpResult {
	const mounted = getV2PaneLayoutStore(workspaceId);
	if (mounted) {
		const { tabs, activeTabId } = mounted.getState();
		const outcome = applyPaneLayoutOp({ version: 1, tabs, activeTabId }, op);
		backgroundClosedTerminal(
			{ version: 1, tabs, activeTabId },
			workspaceId,
			op,
		);
		if (op.type !== "list") mounted.getState().replaceState(outcome.state);
		return { ...outcome, layout: describePaneLayout(outcome.state) };
	}

	const row = collections.v2WorkspaceLocalState.get(workspaceId);
	if (!row && op.type !== "list") {
		throw new PaneLayoutOpError(
			"PRECONDITION_FAILED",
			"This workspace has no pane layout in the desktop app yet. Open it there once, then retry.",
		);
	}
	const previous = applyRememberedV2PaneSelection(
		workspaceId,
		(row?.paneLayout as WorkspaceState<PaneViewerData> | undefined) ??
			EMPTY_LAYOUT,
	);
	const outcome = applyPaneLayoutOp(previous, op);
	backgroundClosedTerminal(previous, workspaceId, op);
	if (op.type !== "list") {
		collections.v2WorkspaceLocalState.update(workspaceId, (draft) => {
			draft.paneLayout = outcome.state;
		});
		rememberV2PaneSelection(workspaceId, outcome.state);
	}
	return { ...outcome, layout: describePaneLayout(outcome.state) };
}

/** Applies pane layout ops sent by the CLI and replies with the result. */
export function usePaneLayoutRequests() {
	const collections = useCollections();

	useEffect(() => {
		const subscription = electronTrpcClient.paneLayout.onRequest.subscribe(
			undefined,
			{
				onData: ({ requestId, workspaceId, op }) => {
					let reply: Parameters<
						typeof electronTrpcClient.paneLayout.respond.mutate
					>[0];
					try {
						const { paneId, tabId, layout } = runPaneLayoutOp(
							collections,
							workspaceId,
							op,
						);
						reply = { requestId, result: { paneId, tabId, layout } };
					} catch (error) {
						reply = {
							requestId,
							error: {
								code:
									error instanceof PaneLayoutOpError ? error.code : undefined,
								message: error instanceof Error ? error.message : String(error),
							},
						};
					}
					electronTrpcClient.paneLayout.respond.mutate(reply).catch((err) => {
						console.error("[usePaneLayoutRequests] reply failed:", err);
					});
				},
			},
		);
		return () => {
			subscription.unsubscribe();
		};
	}, [collections]);
}
