import type { MosaicNode } from "react-mosaic-component";
import type { MosaicDropPosition, Tab, TabsState } from "../types";
import {
	cleanLayout,
	extractPaneIdsFromLayout,
	generateId,
	removePaneFromLayout,
	resolveActiveTabIdForWorkspace,
	updateHistoryStack,
} from "../utils";

/**
 * VS Code-style panels (editor groups): a workspace's content area is a mosaic
 * of panels, each panel holds an ordered strip of tabs and shows its active tab.
 *
 * Panel state is stored loosely (`Tab.panelId`, `panelLayouts`,
 * `panelActiveTabIds`) and resolved on read by `deriveWorkspacePanels`, which
 * repairs any inconsistency deterministically:
 * - no/invalid layout → a single implicit panel holding all tabs
 * - tabs pointing at unknown panels → the workspace's first panel
 * - panels with no tabs → pruned from the tree
 * - stale active-tab pointers → sensible fallbacks
 *
 * Mutations below materialize the derived state and write it back, so the rest
 * of the store never needs panel bookkeeping.
 */

type PanelsInputState = Pick<
	TabsState,
	| "tabs"
	| "panelLayouts"
	| "panelActiveTabIds"
	| "activeTabIds"
	| "tabHistoryStacks"
>;

export interface WorkspacePanels {
	/** Panel split tree; null when the workspace has no tabs */
	layout: MosaicNode<string> | null;
	/** Panel ids in visual order (left-to-right, top-to-bottom) */
	panelIds: string[];
	/** Ordered tab ids per panel (order follows the global tabs array) */
	tabIdsByPanel: Record<string, string[]>;
	panelIdByTabId: Record<string, string>;
	/** Resolved visible tab per panel (always a member of the panel) */
	activeTabIdByPanel: Record<string, string>;
	/** Panel containing the workspace's active tab */
	focusedPanelId: string | null;
	/** Workspace-level active tab (resolved) */
	activeTabId: string | null;
}

const EMPTY_PANELS: WorkspacePanels = {
	layout: null,
	panelIds: [],
	tabIdsByPanel: {},
	panelIdByTabId: {},
	activeTabIdByPanel: {},
	focusedPanelId: null,
	activeTabId: null,
};

/** Stable id for the implicit panel of a workspace without a stored layout */
const implicitPanelId = (workspaceId: string): string => `panel-${workspaceId}`;

export function deriveWorkspacePanels(
	state: PanelsInputState,
	workspaceId: string,
): WorkspacePanels {
	const workspaceTabs = state.tabs.filter((t) => t.workspaceId === workspaceId);
	if (workspaceTabs.length === 0) {
		return EMPTY_PANELS;
	}

	const rawLayout = state.panelLayouts[workspaceId] ?? null;
	let layout: MosaicNode<string> = rawLayout ?? implicitPanelId(workspaceId);
	let orderedLeafIds = extractPaneIdsFromLayout(layout);
	// A layout with duplicate leaves is corrupt — fall back to a single panel
	if (new Set(orderedLeafIds).size !== orderedLeafIds.length) {
		const fallbackId = implicitPanelId(workspaceId);
		layout = fallbackId;
		orderedLeafIds = [fallbackId];
	}
	const leafSet = new Set(orderedLeafIds);
	const defaultPanelId = orderedLeafIds[0];

	const panelIdByTabId: Record<string, string> = {};
	const tabIdsByPanel: Record<string, string[]> = {};
	for (const leafId of orderedLeafIds) {
		tabIdsByPanel[leafId] = [];
	}
	for (const tab of workspaceTabs) {
		const panelId =
			tab.panelId && leafSet.has(tab.panelId) ? tab.panelId : defaultPanelId;
		panelIdByTabId[tab.id] = panelId;
		tabIdsByPanel[panelId].push(tab.id);
	}

	// Prune panels that ended up with no tabs
	const nonEmptyPanelIds = new Set(
		orderedLeafIds.filter((id) => tabIdsByPanel[id].length > 0),
	);
	let finalLayout = layout;
	if (nonEmptyPanelIds.size !== orderedLeafIds.length) {
		finalLayout = cleanLayout(layout, nonEmptyPanelIds) ?? defaultPanelId;
		for (const leafId of orderedLeafIds) {
			if (!nonEmptyPanelIds.has(leafId)) {
				delete tabIdsByPanel[leafId];
			}
		}
	}
	const panelIds = extractPaneIdsFromLayout(finalLayout);

	const activeTabId = resolveActiveTabIdForWorkspace({
		workspaceId,
		tabs: state.tabs,
		activeTabIds: state.activeTabIds,
		tabHistoryStacks: state.tabHistoryStacks,
	});
	const focusedPanelId = activeTabId
		? (panelIdByTabId[activeTabId] ?? panelIds[0])
		: panelIds[0];

	const activeTabIdByPanel: Record<string, string> = {};
	for (const panelId of panelIds) {
		const members = tabIdsByPanel[panelId];
		// The workspace's active tab must always be visible in its panel
		if (panelId === focusedPanelId && activeTabId) {
			activeTabIdByPanel[panelId] = activeTabId;
			continue;
		}
		const recorded = state.panelActiveTabIds[panelId];
		activeTabIdByPanel[panelId] =
			recorded && members.includes(recorded) ? recorded : members[0];
	}

	return {
		layout: finalLayout,
		panelIds,
		tabIdsByPanel,
		panelIdByTabId,
		activeTabIdByPanel,
		focusedPanelId,
		activeTabId,
	};
}

/** Panel that newly created tabs should land in (VS Code: the focused group) */
export function resolveNewTabPanelId(
	state: PanelsInputState,
	workspaceId: string,
): string | undefined {
	return deriveWorkspacePanels(state, workspaceId).focusedPanelId ?? undefined;
}

interface PanelMutationResult {
	tabs: Tab[];
	panelLayouts: TabsState["panelLayouts"];
	panelActiveTabIds: TabsState["panelActiveTabIds"];
	activeTabIds: TabsState["activeTabIds"];
	tabHistoryStacks: TabsState["tabHistoryStacks"];
}

/** Replace a leaf node with a subtree, preserving untouched branches */
const replaceLeaf = (
	node: MosaicNode<string>,
	leafId: string,
	replacement: MosaicNode<string>,
): MosaicNode<string> => {
	if (typeof node === "string") {
		return node === leafId ? replacement : node;
	}
	const first = replaceLeaf(node.first, leafId, replacement);
	const second = replaceLeaf(node.second, leafId, replacement);
	if (first === node.first && second === node.second) {
		return node;
	}
	return { ...node, first, second };
};

/**
 * Stamp every workspace tab with its resolved panel id (materializing the
 * derived assignment), overriding the moved tab.
 */
const stampPanelAssignments = (
	workspaceTabs: Tab[],
	derived: WorkspacePanels,
	movedTabId: string,
	movedTabPanelId: string,
): Tab[] =>
	workspaceTabs.map((tab) => {
		const panelId =
			tab.id === movedTabId ? movedTabPanelId : derived.panelIdByTabId[tab.id];
		return tab.panelId === panelId ? tab : { ...tab, panelId };
	});

/**
 * Reorder `workspaceTabs` so the moved tab sits at `targetIndex` within its
 * new panel's strip (panel membership must already be stamped).
 */
const placeTabInPanelOrder = (
	workspaceTabs: Tab[],
	tabId: string,
	targetPanelId: string,
	targetIndex: number | undefined,
): Tab[] => {
	const movedTab = workspaceTabs.find((t) => t.id === tabId);
	if (!movedTab) return workspaceTabs;

	const withoutMoved = workspaceTabs.filter((t) => t.id !== tabId);
	const targetMembers = withoutMoved.filter((t) => t.panelId === targetPanelId);

	let insertAt: number;
	if (targetIndex === undefined || targetIndex >= targetMembers.length) {
		const lastMember = targetMembers[targetMembers.length - 1];
		insertAt = lastMember
			? withoutMoved.indexOf(lastMember) + 1
			: withoutMoved.length;
	} else {
		insertAt = withoutMoved.indexOf(targetMembers[targetIndex]);
	}

	withoutMoved.splice(insertAt, 0, movedTab);
	return withoutMoved;
};

const buildActiveTabRecords = (
	state: PanelsInputState,
	derived: WorkspacePanels,
	options: {
		movedTabId: string;
		sourcePanelId: string;
		targetPanelId: string;
		sourceRemoved: boolean;
	},
): TabsState["panelActiveTabIds"] => {
	const next = { ...state.panelActiveTabIds };
	// Materialize resolved values so future reads don't depend on fallbacks
	for (const panelId of derived.panelIds) {
		next[panelId] = derived.activeTabIdByPanel[panelId];
	}

	const { movedTabId, sourcePanelId, targetPanelId, sourceRemoved } = options;
	next[targetPanelId] = movedTabId;

	if (sourceRemoved) {
		delete next[sourcePanelId];
	} else if (
		sourcePanelId !== targetPanelId &&
		next[sourcePanelId] === movedTabId
	) {
		const remaining = derived.tabIdsByPanel[sourcePanelId].filter(
			(id) => id !== movedTabId,
		);
		if (remaining.length > 0) {
			next[sourcePanelId] = remaining[0];
		} else {
			delete next[sourcePanelId];
		}
	}

	return next;
};

const activateMovedTab = (
	state: PanelsInputState,
	workspaceId: string,
	tabId: string,
): Pick<TabsState, "activeTabIds" | "tabHistoryStacks"> => ({
	activeTabIds: { ...state.activeTabIds, [workspaceId]: tabId },
	tabHistoryStacks: {
		...state.tabHistoryStacks,
		[workspaceId]: updateHistoryStack(
			state.tabHistoryStacks[workspaceId] || [],
			state.activeTabIds[workspaceId] ?? null,
			tabId,
		),
	},
});

export function moveTabToPanel(
	state: PanelsInputState,
	tabId: string,
	targetPanelId: string,
	targetIndex?: number,
): PanelMutationResult | null {
	const tab = state.tabs.find((t) => t.id === tabId);
	if (!tab) return null;

	const workspaceId = tab.workspaceId;
	const derived = deriveWorkspacePanels(state, workspaceId);
	if (!derived.layout || !derived.tabIdsByPanel[targetPanelId]) return null;

	const sourcePanelId = derived.panelIdByTabId[tabId];
	const isReorder = sourcePanelId === targetPanelId;
	if (isReorder && targetIndex === undefined) return null;

	const workspaceTabs = state.tabs.filter((t) => t.workspaceId === workspaceId);
	const otherTabs = state.tabs.filter((t) => t.workspaceId !== workspaceId);

	const stamped = stampPanelAssignments(
		workspaceTabs,
		derived,
		tabId,
		targetPanelId,
	);
	const reordered = placeTabInPanelOrder(
		stamped,
		tabId,
		targetPanelId,
		targetIndex,
	);

	if (isReorder) {
		// Pure strip reorder: don't touch activation/focus (used on drag hover)
		return {
			tabs: [...otherTabs, ...reordered],
			panelLayouts: state.panelLayouts,
			panelActiveTabIds: state.panelActiveTabIds,
			activeTabIds: state.activeTabIds,
			tabHistoryStacks: state.tabHistoryStacks,
		};
	}

	const sourceRemoved = derived.tabIdsByPanel[sourcePanelId].length === 1;
	const layoutAfterMove = sourceRemoved
		? (removePaneFromLayout(derived.layout, sourcePanelId) ?? targetPanelId)
		: derived.layout;

	return {
		tabs: [...otherTabs, ...reordered],
		panelLayouts: { ...state.panelLayouts, [workspaceId]: layoutAfterMove },
		panelActiveTabIds: buildActiveTabRecords(state, derived, {
			movedTabId: tabId,
			sourcePanelId,
			targetPanelId,
			sourceRemoved,
		}),
		...activateMovedTab(state, workspaceId, tabId),
	};
}

export function splitPanelWithTab(
	state: PanelsInputState,
	tabId: string,
	destinationPanelId: string,
	position: MosaicDropPosition,
): PanelMutationResult | null {
	const tab = state.tabs.find((t) => t.id === tabId);
	if (!tab) return null;

	const workspaceId = tab.workspaceId;
	const derived = deriveWorkspacePanels(state, workspaceId);
	if (!derived.layout || !derived.tabIdsByPanel[destinationPanelId]) {
		return null;
	}

	const sourcePanelId = derived.panelIdByTabId[tabId];
	const sourceRemoved = derived.tabIdsByPanel[sourcePanelId].length === 1;
	// Splitting a panel with its own only tab would collapse right back
	if (sourcePanelId === destinationPanelId && sourceRemoved) return null;

	const newPanelId = generateId("panel");
	const direction =
		position === "left" || position === "right" ? "row" : "column";
	const isFirst = position === "left" || position === "top";
	const splitNode: MosaicNode<string> = {
		direction,
		first: isFirst ? newPanelId : destinationPanelId,
		second: isFirst ? destinationPanelId : newPanelId,
		splitPercentage: 50,
	};

	let layout = replaceLeaf(derived.layout, destinationPanelId, splitNode);
	if (sourceRemoved) {
		layout = removePaneFromLayout(layout, sourcePanelId) ?? newPanelId;
	}

	const workspaceTabs = state.tabs.filter((t) => t.workspaceId === workspaceId);
	const otherTabs = state.tabs.filter((t) => t.workspaceId !== workspaceId);
	const stamped = stampPanelAssignments(
		workspaceTabs,
		derived,
		tabId,
		newPanelId,
	);

	return {
		tabs: [...otherTabs, ...stamped],
		panelLayouts: { ...state.panelLayouts, [workspaceId]: layout },
		panelActiveTabIds: buildActiveTabRecords(state, derived, {
			movedTabId: tabId,
			sourcePanelId,
			targetPanelId: newPanelId,
			sourceRemoved,
		}),
		...activateMovedTab(state, workspaceId, tabId),
	};
}
