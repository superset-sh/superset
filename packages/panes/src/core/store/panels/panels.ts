import type {
	LayoutNode,
	SplitPosition,
	Tab,
	WorkspaceState,
} from "../../../types";
import {
	equalizeAllSplits,
	generateId,
	getPaneIdsInLayout,
	positionToDirection,
	removePaneFromLayout,
} from "../utils";

/**
 * VS Code-style panels (editor groups): the workspace is a split tree of
 * panels, each holding an ordered strip of tabs and showing its active tab.
 *
 * The panel tree reuses `LayoutNode` — leaves are `{ type: "pane", paneId }`
 * nodes whose `paneId` carries a *panel* id.
 *
 * Panel state is stored loosely (`Tab.panelId`, `WorkspaceState.panelLayout`,
 * `panelActiveTabIds`) and resolved on read by `deriveWorkspacePanels`, which
 * repairs inconsistencies deterministically:
 * - missing/corrupt layout → a single implicit panel holding all tabs
 * - tabs pointing at unknown panels → the first panel
 * - panels with no tabs → pruned from the tree (at least one panel remains)
 * - stale active-tab pointers → sensible fallbacks
 *
 * Mutations materialize the derived state and write it back, so other store
 * actions never need panel bookkeeping.
 */

/** Panel id used when no layout has been stored yet (single-panel workspace) */
export const IMPLICIT_PANEL_ID = "panel-main";

const panelLeaf = (panelId: string): LayoutNode => ({
	type: "pane",
	paneId: panelId,
});

export interface DerivedPanels {
	/** Panel split tree; leaves carry panel ids. Always has ≥ 1 leaf. */
	layout: LayoutNode;
	/** Panel ids in visual order */
	panelIds: string[];
	/** Ordered tab ids per panel (order follows the tabs array) */
	tabIdsByPanel: Record<string, string[]>;
	panelIdByTabId: Record<string, string>;
	/** Visible tab per panel (null only for an empty implicit panel) */
	activeTabIdByPanel: Record<string, string | null>;
	/** Panel containing the workspace's active tab */
	focusedPanelId: string;
}

type PanelsSource<TData> = Pick<
	WorkspaceState<TData>,
	"tabs" | "activeTabId" | "panelLayout" | "panelActiveTabIds"
>;

/** Remove leaves not in `keep`, promoting siblings (null if none remain) */
const pruneLayoutLeaves = (
	node: LayoutNode,
	keep: ReadonlySet<string>,
): LayoutNode | null => {
	if (node.type === "pane") {
		return keep.has(node.paneId) ? node : null;
	}
	const first = pruneLayoutLeaves(node.first, keep);
	const second = pruneLayoutLeaves(node.second, keep);
	if (!first && !second) return null;
	if (!first) return second;
	if (!second) return first;
	if (first === node.first && second === node.second) return node;
	return { ...node, first, second };
};

/** Replace a leaf with a subtree, preserving untouched branches */
const replaceLeaf = (
	node: LayoutNode,
	panelId: string,
	replacement: LayoutNode,
): LayoutNode => {
	if (node.type === "pane") {
		return node.paneId === panelId ? replacement : node;
	}
	const first = replaceLeaf(node.first, panelId, replacement);
	const second = replaceLeaf(node.second, panelId, replacement);
	if (first === node.first && second === node.second) return node;
	return { ...node, first, second };
};

export function deriveWorkspacePanels<TData>(
	state: PanelsSource<TData>,
): DerivedPanels {
	const rawLayout = state.panelLayout ?? null;
	let layout: LayoutNode = rawLayout ?? panelLeaf(IMPLICIT_PANEL_ID);
	let leafIds = getPaneIdsInLayout(layout);
	// Duplicate leaves mean a corrupt layout — fall back to a single panel
	if (new Set(leafIds).size !== leafIds.length) {
		layout = panelLeaf(IMPLICIT_PANEL_ID);
		leafIds = [IMPLICIT_PANEL_ID];
	}

	const leafSet = new Set(leafIds);
	const defaultPanelId = leafIds[0] as string;

	const panelIdByTabId: Record<string, string> = {};
	const tabIdsByPanel: Record<string, string[]> = {};
	for (const leafId of leafIds) {
		tabIdsByPanel[leafId] = [];
	}
	for (const tab of state.tabs) {
		const panelId =
			tab.panelId && leafSet.has(tab.panelId) ? tab.panelId : defaultPanelId;
		panelIdByTabId[tab.id] = panelId;
		tabIdsByPanel[panelId]?.push(tab.id);
	}

	// Prune panels with no tabs (keep at least one so the workspace renders)
	const nonEmpty = new Set(
		leafIds.filter((id) => (tabIdsByPanel[id]?.length ?? 0) > 0),
	);
	if (nonEmpty.size > 0 && nonEmpty.size !== leafIds.length) {
		layout = pruneLayoutLeaves(layout, nonEmpty) ?? panelLeaf(defaultPanelId);
		for (const leafId of leafIds) {
			if (!nonEmpty.has(leafId)) {
				delete tabIdsByPanel[leafId];
			}
		}
	}
	const panelIds = getPaneIdsInLayout(layout);

	const activeTabId =
		state.activeTabId && panelIdByTabId[state.activeTabId]
			? state.activeTabId
			: null;
	const focusedPanelId = activeTabId
		? (panelIdByTabId[activeTabId] as string)
		: (panelIds[0] as string);

	const recorded = state.panelActiveTabIds ?? {};
	const activeTabIdByPanel: Record<string, string | null> = {};
	for (const panelId of panelIds) {
		const members = tabIdsByPanel[panelId] ?? [];
		// The workspace's active tab is always visible in its panel
		if (panelId === focusedPanelId && activeTabId) {
			activeTabIdByPanel[panelId] = activeTabId;
			continue;
		}
		const recordedTabId = recorded[panelId];
		activeTabIdByPanel[panelId] =
			recordedTabId && members.includes(recordedTabId)
				? recordedTabId
				: (members[0] ?? null);
	}

	return {
		layout,
		panelIds,
		tabIdsByPanel,
		panelIdByTabId,
		activeTabIdByPanel,
		focusedPanelId,
	};
}

export interface PanelsMutation<TData> {
	tabs: Tab<TData>[];
	panelLayout: LayoutNode;
	panelActiveTabIds: Record<string, string>;
	activeTabId: string | null;
}

/** Stamp every tab with its resolved panel id, overriding the moved tab */
const stampPanelAssignments = <TData>(
	tabs: Tab<TData>[],
	derived: DerivedPanels,
	movedTabId: string,
	movedTabPanelId: string,
): Tab<TData>[] =>
	tabs.map((tab) => {
		const panelId =
			tab.id === movedTabId ? movedTabPanelId : derived.panelIdByTabId[tab.id];
		return tab.panelId === panelId ? tab : { ...tab, panelId };
	});

/**
 * Reorder `tabs` so the moved tab sits at `toIndex` within its new panel's
 * strip. `toIndex` counts the target panel's members excluding the moved tab.
 */
const placeTabInPanelOrder = <TData>(
	tabs: Tab<TData>[],
	tabId: string,
	targetPanelId: string,
	toIndex: number | undefined,
): Tab<TData>[] => {
	const movedTab = tabs.find((t) => t.id === tabId);
	if (!movedTab) return tabs;

	const withoutMoved = tabs.filter((t) => t.id !== tabId);
	const targetMembers = withoutMoved.filter((t) => t.panelId === targetPanelId);

	let insertAt: number;
	if (toIndex === undefined || toIndex >= targetMembers.length) {
		const lastMember = targetMembers[targetMembers.length - 1];
		insertAt = lastMember
			? withoutMoved.indexOf(lastMember) + 1
			: withoutMoved.length;
	} else {
		insertAt = withoutMoved.indexOf(targetMembers[toIndex] as Tab<TData>);
	}

	withoutMoved.splice(insertAt, 0, movedTab);
	return withoutMoved;
};

const buildActiveTabRecords = <TData>(
	state: PanelsSource<TData>,
	derived: DerivedPanels,
	options: {
		movedTabId: string;
		sourcePanelId: string;
		targetPanelId: string;
		sourceRemoved: boolean;
	},
): Record<string, string> => {
	const next: Record<string, string> = { ...(state.panelActiveTabIds ?? {}) };
	// Materialize resolved values so future reads don't depend on fallbacks
	for (const panelId of derived.panelIds) {
		const active = derived.activeTabIdByPanel[panelId];
		if (active) next[panelId] = active;
	}

	const { movedTabId, sourcePanelId, targetPanelId, sourceRemoved } = options;
	next[targetPanelId] = movedTabId;

	if (sourceRemoved) {
		delete next[sourcePanelId];
	} else if (
		sourcePanelId !== targetPanelId &&
		next[sourcePanelId] === movedTabId
	) {
		const remaining = (derived.tabIdsByPanel[sourcePanelId] ?? []).filter(
			(id) => id !== movedTabId,
		);
		const fallback = remaining[0];
		if (fallback) {
			next[sourcePanelId] = fallback;
		} else {
			delete next[sourcePanelId];
		}
	}

	return next;
};

export function moveTabToPanel<TData>(
	state: PanelsSource<TData>,
	args: { tabId: string; targetPanelId: string; toIndex?: number },
): PanelsMutation<TData> | null {
	const tab = state.tabs.find((t) => t.id === args.tabId);
	if (!tab) return null;

	const derived = deriveWorkspacePanels(state);
	if (!derived.tabIdsByPanel[args.targetPanelId]) return null;

	const sourcePanelId = derived.panelIdByTabId[args.tabId] as string;
	const isReorder = sourcePanelId === args.targetPanelId;
	if (isReorder && args.toIndex === undefined) return null;

	const stamped = stampPanelAssignments(
		state.tabs,
		derived,
		args.tabId,
		args.targetPanelId,
	);
	const reordered = placeTabInPanelOrder(
		stamped,
		args.tabId,
		args.targetPanelId,
		args.toIndex,
	);

	if (isReorder) {
		// Pure strip reorder: keep activation untouched
		return {
			tabs: reordered,
			panelLayout: derived.layout,
			panelActiveTabIds: state.panelActiveTabIds ?? {},
			activeTabId: state.activeTabId,
		};
	}

	const sourceRemoved =
		(derived.tabIdsByPanel[sourcePanelId]?.length ?? 0) === 1;
	const panelLayout = sourceRemoved
		? (removePaneFromLayout(derived.layout, sourcePanelId) ??
			panelLeaf(args.targetPanelId))
		: derived.layout;

	return {
		tabs: reordered,
		panelLayout,
		panelActiveTabIds: buildActiveTabRecords(state, derived, {
			movedTabId: args.tabId,
			sourcePanelId,
			targetPanelId: args.targetPanelId,
			sourceRemoved,
		}),
		activeTabId: args.tabId,
	};
}

export function splitPanelWithTab<TData>(
	state: PanelsSource<TData>,
	args: { tabId: string; targetPanelId: string; position: SplitPosition },
): PanelsMutation<TData> | null {
	const tab = state.tabs.find((t) => t.id === args.tabId);
	if (!tab) return null;

	const derived = deriveWorkspacePanels(state);
	if (!derived.tabIdsByPanel[args.targetPanelId]) return null;

	const sourcePanelId = derived.panelIdByTabId[args.tabId] as string;
	const sourceRemoved =
		(derived.tabIdsByPanel[sourcePanelId]?.length ?? 0) === 1;
	// Splitting a panel with its own only tab would collapse right back
	if (sourcePanelId === args.targetPanelId && sourceRemoved) return null;

	const newPanelId = generateId("panel");
	const splitNode: LayoutNode = {
		type: "split",
		direction: positionToDirection(args.position),
		first:
			args.position === "left" || args.position === "top"
				? panelLeaf(newPanelId)
				: panelLeaf(args.targetPanelId),
		second:
			args.position === "left" || args.position === "top"
				? panelLeaf(args.targetPanelId)
				: panelLeaf(newPanelId),
	};

	let panelLayout = replaceLeaf(derived.layout, args.targetPanelId, splitNode);
	if (sourceRemoved) {
		panelLayout =
			removePaneFromLayout(panelLayout, sourcePanelId) ?? panelLeaf(newPanelId);
	}
	// A new panel joins as an equal: give every panel the same share
	panelLayout = equalizeAllSplits(panelLayout);

	const stamped = stampPanelAssignments(
		state.tabs,
		derived,
		args.tabId,
		newPanelId,
	);

	return {
		tabs: stamped,
		panelLayout,
		panelActiveTabIds: buildActiveTabRecords(state, derived, {
			movedTabId: args.tabId,
			sourcePanelId,
			targetPanelId: newPanelId,
			sourceRemoved,
		}),
		activeTabId: args.tabId,
	};
}

/**
 * Record the active tab into its panel whenever activation changes, so a
 * panel remembers its visible tab when focus moves to another panel. Returns
 * null when nothing needs updating (keeps store subscriptions loop-free).
 */
export function computePanelActiveSync<TData>(
	state: PanelsSource<TData>,
): Pick<WorkspaceState<TData>, "panelActiveTabIds"> | null {
	if (!state.activeTabId) return null;
	const derived = deriveWorkspacePanels(state);
	const panelId = derived.panelIdByTabId[state.activeTabId];
	if (!panelId) return null;
	if (state.panelActiveTabIds?.[panelId] === state.activeTabId) {
		return null;
	}
	return {
		panelActiveTabIds: {
			...(state.panelActiveTabIds ?? {}),
			[panelId]: state.activeTabId,
		},
	};
}

/** Share the expanded panel's branch takes at each split along its path */
const EXPANDED_PANEL_SHARE = 75;

/**
 * Layout with `panelId` expanded VS Code-style: its branch gets the dominant
 * share at every ancestor split; sibling subtrees share the rest evenly.
 * Returns null when the panel isn't in the tree.
 */
export function buildExpandedPanelLayout(
	layout: LayoutNode,
	panelId: string,
): LayoutNode | null {
	if (layout.type === "pane") {
		return layout.paneId === panelId ? layout : null;
	}
	const first = buildExpandedPanelLayout(layout.first, panelId);
	if (first) {
		return {
			...layout,
			splitPercentage: EXPANDED_PANEL_SHARE,
			first,
			second: equalizeAllSplits(layout.second),
		};
	}
	const second = buildExpandedPanelLayout(layout.second, panelId);
	if (second) {
		return {
			...layout,
			splitPercentage: 100 - EXPANDED_PANEL_SHARE,
			first: equalizeAllSplits(layout.first),
			second,
		};
	}
	return null;
}

/** Same tree with matching split sizes (± 1%; missing size = 50) */
const splitSizesMatch = (a: LayoutNode, b: LayoutNode): boolean => {
	if (a.type === "pane" || b.type === "pane") {
		return a.type === "pane" && b.type === "pane" && a.paneId === b.paneId;
	}
	return (
		Math.abs((a.splitPercentage ?? 50) - (b.splitPercentage ?? 50)) < 1 &&
		splitSizesMatch(a.first, b.first) &&
		splitSizesMatch(a.second, b.second)
	);
};

/** Whether the layout already matches the expanded arrangement for `panelId` */
export function isPanelExpanded(layout: LayoutNode, panelId: string): boolean {
	if (layout.type === "pane") return false;
	const expanded = buildExpandedPanelLayout(layout, panelId);
	return expanded !== null && splitSizesMatch(layout, expanded);
}
