import {
	createWorkspaceStore,
	findPanePath,
	type Pane,
	replacePaneIdInLayout,
	type SplitPosition,
	type Tab,
	type WorkspaceState,
	type WorkspaceStore,
} from "@superset/panes";
import type {
	PaneLayoutErrorCode,
	PaneLayoutOp,
	PaneSplitDirection,
} from "@superset/shared/pane-layout-ops";
import { preserveLocalPaneSelection } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/useV2WorkspacePaneLayout/utils/preserveLocalPaneSelection";
import type { PaneViewerData } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/types";

type LayoutState = WorkspaceState<PaneViewerData>;

export class PaneLayoutOpError extends Error {
	constructor(
		readonly code: PaneLayoutErrorCode,
		message: string,
	) {
		super(message);
	}
}

export interface PaneLayoutOpOutcome {
	state: LayoutState;
	paneId: string | null;
	tabId: string | null;
}

const SPLIT_POSITIONS: Record<PaneSplitDirection, SplitPosition> = {
	right: "right",
	left: "left",
	down: "bottom",
	up: "top",
};

function locatePane(
	state: LayoutState,
	paneId: string,
): { tab: Tab<PaneViewerData>; pane: Pane<PaneViewerData> } {
	for (const tab of state.tabs) {
		const pane = tab.panes[paneId];
		if (pane) return { tab, pane };
	}
	throw new PaneLayoutOpError(
		"NOT_FOUND",
		`No pane ${paneId} in this workspace`,
	);
}

function runInStore(
	state: LayoutState,
	run: (store: WorkspaceStore<PaneViewerData>) => void,
): LayoutState {
	const store = createWorkspaceStore<PaneViewerData>({ initialState: state });
	run(store.getState());
	const next = store.getState();
	return { version: 1, tabs: next.tabs, activeTabId: next.activeTabId };
}

function tabIdOf(state: LayoutState, paneId: string): string | null {
	return state.tabs.find((tab) => tab.panes[paneId])?.id ?? null;
}

function swapPanes(state: LayoutState, aId: string, bId: string): LayoutState {
	const a = locatePane(state, aId);
	const b = locatePane(state, bId);
	if (aId === bId) {
		throw new PaneLayoutOpError(
			"BAD_REQUEST",
			"Cannot swap a pane with itself",
		);
	}
	if (a.tab.id === b.tab.id) {
		const placeholder = `${aId}:swap`;
		const layout = replacePaneIdInLayout(
			replacePaneIdInLayout(
				replacePaneIdInLayout(a.tab.layout, aId, placeholder),
				bId,
				aId,
			),
			placeholder,
			bId,
		);
		return {
			...state,
			tabs: state.tabs.map((tab) =>
				tab.id === a.tab.id ? { ...tab, layout } : tab,
			),
		};
	}
	const exchange = (
		tab: Tab<PaneViewerData>,
		outId: string,
		incoming: Pane<PaneViewerData>,
	): Tab<PaneViewerData> => {
		const { [outId]: _, ...rest } = tab.panes;
		return {
			...tab,
			layout: replacePaneIdInLayout(tab.layout, outId, incoming.id),
			panes: { ...rest, [incoming.id]: incoming },
			activePaneId: tab.activePaneId === outId ? incoming.id : tab.activePaneId,
		};
	};
	return {
		...state,
		tabs: state.tabs.map((tab) => {
			if (tab.id === a.tab.id) return exchange(tab, aId, b.pane);
			if (tab.id === b.tab.id) return exchange(tab, bId, a.pane);
			return tab;
		}),
	};
}

/**
 * Applies one CLI layout op. Only `focus` changes which tab and pane are
 * active; every other op keeps the caller's current selection.
 */
export function applyPaneLayoutOp(
	state: LayoutState,
	op: PaneLayoutOp,
	createPaneId: () => string = () => `pane-${crypto.randomUUID()}`,
): PaneLayoutOpOutcome {
	const keepSelection = (next: LayoutState) =>
		preserveLocalPaneSelection(state, next);

	switch (op.type) {
		case "list":
			return { state, paneId: null, tabId: null };

		case "split": {
			const { tab } = locatePane(state, op.paneId);
			const paneId = createPaneId();
			const next = runInStore(state, (store) =>
				store.splitPane({
					tabId: tab.id,
					paneId: op.paneId,
					position: SPLIT_POSITIONS[op.direction],
					newPane: {
						id: paneId,
						kind: "terminal",
						data: { terminalId: op.terminalId },
					},
				}),
			);
			return { state: keepSelection(next), paneId, tabId: tab.id };
		}

		case "resize": {
			const { tab } = locatePane(state, op.paneId);
			const path = findPanePath(tab.layout, op.paneId);
			const branch = path?.at(-1);
			if (!path || !branch) {
				throw new PaneLayoutOpError(
					"BAD_REQUEST",
					`Pane ${op.paneId} is the only pane in its tab, so there is no split to resize`,
				);
			}
			const firstShare = branch === "first" ? op.ratio : 1 - op.ratio;
			const next = runInStore(state, (store) =>
				store.resizeSplit({
					tabId: tab.id,
					path: path.slice(0, -1),
					splitPercentage: firstShare * 100,
				}),
			);
			return { state: next, paneId: op.paneId, tabId: tab.id };
		}

		case "equalize": {
			const { tabId } = op;
			if (tabId && !state.tabs.some((tab) => tab.id === tabId)) {
				throw new PaneLayoutOpError(
					"NOT_FOUND",
					`No tab ${tabId} in this workspace`,
				);
			}
			const next = runInStore(state, (store) => {
				for (const tab of state.tabs) {
					if (!tabId || tab.id === tabId) store.equalizeTab({ tabId: tab.id });
				}
			});
			return { state: next, paneId: null, tabId: tabId ?? null };
		}

		case "focus": {
			const { tab } = locatePane(state, op.paneId);
			const next = runInStore(state, (store) =>
				store.setActivePane({ tabId: tab.id, paneId: op.paneId }),
			);
			return { state: next, paneId: op.paneId, tabId: tab.id };
		}

		case "close": {
			const { tab } = locatePane(state, op.paneId);
			const next = runInStore(state, (store) =>
				store.closePane({ tabId: tab.id, paneId: op.paneId }),
			);
			return { state: keepSelection(next), paneId: op.paneId, tabId: tab.id };
		}

		case "move": {
			locatePane(state, op.paneId);
			locatePane(state, op.targetPaneId);
			if (op.paneId === op.targetPaneId) {
				throw new PaneLayoutOpError(
					"BAD_REQUEST",
					"Cannot move a pane next to itself",
				);
			}
			const next = runInStore(state, (store) =>
				store.movePaneToSplit({
					sourcePaneId: op.paneId,
					targetPaneId: op.targetPaneId,
					position: SPLIT_POSITIONS[op.direction],
				}),
			);
			return {
				state: keepSelection(next),
				paneId: op.paneId,
				tabId: tabIdOf(next, op.paneId),
			};
		}

		case "moveToNewTab": {
			locatePane(state, op.paneId);
			const next = runInStore(state, (store) =>
				store.movePaneToNewTab({ paneId: op.paneId }),
			);
			return {
				state: keepSelection(next),
				paneId: op.paneId,
				tabId: tabIdOf(next, op.paneId),
			};
		}

		case "newTab": {
			const paneId = createPaneId();
			const next = runInStore(state, (store) =>
				store.addTab({
					panes: [
						{
							id: paneId,
							kind: "terminal",
							data: { terminalId: op.terminalId },
						},
					],
				}),
			);
			return {
				state: keepSelection(next),
				paneId,
				tabId: tabIdOf(next, paneId),
			};
		}

		case "swap": {
			const next = swapPanes(state, op.paneId, op.withPaneId);
			return {
				state: keepSelection(next),
				paneId: op.paneId,
				tabId: tabIdOf(next, op.paneId),
			};
		}
	}
}
