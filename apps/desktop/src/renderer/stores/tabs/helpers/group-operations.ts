import type { MosaicNode } from "react-mosaic-component";
import type { Tab, TabsState } from "../types";
import { TabType } from "../types";
import { validateGroupLayouts } from "./validation";
import { getChildTabIds } from "../utils";
import { removeTabFromLayout } from "../drag-logic";

const handleEmptyGroupRemoval = (
	tabs: Tab[],
	activeTabIds: Record<string, string | null>,
	tabHistoryStacks: Record<string, string[]>,
	workspaceId: string,
	idsToRemove: string[],
	fallbackActiveTabId?: string,
): TabsState => {
	const remainingTabs = tabs.filter((tab) => !idsToRemove.includes(tab.id));
	const currentActiveId = activeTabIds[workspaceId];
	const historyStack = tabHistoryStacks[workspaceId] || [];

	const newActiveTabIds = { ...activeTabIds };
	const newHistoryStack = historyStack.filter(
		(id) => !idsToRemove.includes(id),
	);

	// Ensure a valid tab is active after removal to prevent UI confusion
	if (idsToRemove.includes(currentActiveId || "")) {
		const workspaceTabs = remainingTabs.filter(
			(tab) => tab.workspaceId === workspaceId,
		);

		if (workspaceTabs.length > 0) {
			// Prefer fallback tab (e.g., ungrouped tab), then history, then first available
			if (
				fallbackActiveTabId &&
				remainingTabs.some((t) => t.id === fallbackActiveTabId)
			) {
				newActiveTabIds[workspaceId] = fallbackActiveTabId;
			} else {
				const nextTabFromHistory = newHistoryStack.find((tabId) =>
					workspaceTabs.some((tab) => tab.id === tabId),
				);
				newActiveTabIds[workspaceId] =
					nextTabFromHistory || workspaceTabs[0].id;
			}
		} else {
			newActiveTabIds[workspaceId] = null;
		}
	}

	return {
		tabs: remainingTabs,
		activeTabIds: newActiveTabIds,
		tabHistoryStacks: {
			...tabHistoryStacks,
			[workspaceId]: newHistoryStack,
		},
	};
};

export const handleUpdateTabGroupLayout = (
	state: TabsState,
	id: string,
	layout: MosaicNode<string>,
): Partial<TabsState> => {
	return {
		tabs: state.tabs.map((tab) =>
			tab.id === id && tab.type === TabType.Group
				? { ...tab, layout }
				: tab,
		),
	};
};

export const handleAddChildTabToGroup = (
	state: TabsState,
	groupId: string,
	childTabId: string,
): Partial<TabsState> => {
	const updatedTabs = state.tabs.map((tab) => {
		if (tab.id === childTabId) {
			return {
				...tab,
				parentId: groupId,
			};
		}
		return tab;
	});

	// Layout updates are handled separately to allow callers to batch operations

	return {
		tabs: updatedTabs,
	};
};

export const handleRemoveChildTabFromGroup = (
	state: TabsState,
	groupId: string,
	childTabId: string,
): Partial<TabsState> => {
	const group = state.tabs.find(
		(tab) => tab.id === groupId && tab.type === TabType.Group,
	);
	if (!group || group.type !== TabType.Group) return {};

	const updatedChildTabIds = getChildTabIds(
		state.tabs,
		groupId,
	).filter((id: string) => id !== childTabId);

	// Empty groups are invalid and must be removed to prevent orphaned state
	if (updatedChildTabIds.length === 0) {
		return handleEmptyGroupRemoval(
			state.tabs,
			state.activeTabIds,
			state.tabHistoryStacks,
			group.workspaceId,
			[groupId, childTabId],
		);
	}

	// Layouts may reference removed tabs, so clean them up
	const validatedTabs = validateGroupLayouts(
		state.tabs.filter((tab) => tab.id !== childTabId),
	);

	return {
		tabs: validatedTabs,
	};
};

export const handleUngroupTab = (
	state: TabsState,
	tabId: string,
	targetIndex?: number,
): Partial<TabsState> => {
	const tab = state.tabs.find((t) => t.id === tabId);
	if (!tab || !tab.parentId) return {};

	const parentGroup = state.tabs.find(
		(t) => t.id === tab.parentId && t.type === TabType.Group,
	);
	if (!parentGroup || parentGroup.type !== TabType.Group) return {};

	const updatedTab: Tab = {
		...tab,
		parentId: undefined,
	};

	const updatedLayout = removeTabFromLayout(
		parentGroup.layout,
		tabId,
	) as MosaicNode<string> | null;

	const remainingChildren = state.tabs.filter(
		(t) => t.parentId === parentGroup.id && t.id !== tabId,
	);

	const updatedTabs = state.tabs.map((t) => {
		if (t.id === tabId) return updatedTab;
		if (t.id === parentGroup.id && t.type === TabType.Group) {
			return {
				...t,
				layout: updatedLayout,
			};
		}
		return t;
	});

	// Empty groups are invalid and must be removed
	if (remainingChildren.length === 0) {
		const result = handleEmptyGroupRemoval(
			updatedTabs,
			state.activeTabIds,
			state.tabHistoryStacks,
			tab.workspaceId,
			[parentGroup.id],
			tabId,
		);

		if (targetIndex !== undefined) {
			const workspaceTabs = result.tabs.filter(
				(t) => t.workspaceId === tab.workspaceId && !t.parentId,
			);
			const otherTabs = result.tabs.filter(
				(t) => t.workspaceId !== tab.workspaceId || t.parentId,
			);

			const tabToMove = workspaceTabs.find((t) => t.id === tabId);
			if (tabToMove) {
				const filteredTabs = workspaceTabs.filter(
					(t) => t.id !== tabId,
				);
				filteredTabs.splice(targetIndex, 0, tabToMove);
				result.tabs = [...otherTabs, ...filteredTabs];
			}
		}

		return result;
	}

	// Layouts may reference removed tabs, so clean them up
	let validatedTabs = validateGroupLayouts(updatedTabs);

	if (targetIndex !== undefined) {
		const workspaceId = tab.workspaceId;
		const workspaceTabs = validatedTabs.filter(
			(t) => t.workspaceId === workspaceId && !t.parentId,
		);
		const otherTabs = validatedTabs.filter(
			(t) => t.workspaceId !== workspaceId || t.parentId,
		);

		const tabToMove = workspaceTabs.find((t) => t.id === tabId);
		if (tabToMove) {
			const filteredTabs = workspaceTabs.filter((t) => t.id !== tabId);
			filteredTabs.splice(targetIndex, 0, tabToMove);
			validatedTabs = [...otherTabs, ...filteredTabs];
		}
	}

	return {
		...state,
		tabs: validatedTabs,
	};
};

export const handleUngroupTabs = (
	state: TabsState,
	groupId: string,
): Partial<TabsState> => {
	const group = state.tabs.find(
		(t) => t.id === groupId && t.type === TabType.Group,
	);
	if (!group || group.type !== TabType.Group) return {};

	const childTabIds = getChildTabIds(state.tabs, groupId);
	if (childTabIds.length === 0) return {};

	// Preserve tab order by placing ungrouped tabs where the group was
	const workspaceId = group.workspaceId;
	const workspaceTabs = state.tabs.filter(
		(t) => t.workspaceId === workspaceId && !t.parentId,
	);
	const groupIndex = workspaceTabs.findIndex((t) => t.id === groupId);

	const updatedTabs = state.tabs
		.map((tab) => {
			if (childTabIds.includes(tab.id)) {
				return {
					...tab,
					parentId: undefined,
				};
			}
			return tab;
		})
		.filter((tab) => tab.id !== groupId);

	const newWorkspaceTabs = updatedTabs.filter(
		(t) => t.workspaceId === workspaceId && !t.parentId,
	);
	const otherTabs = updatedTabs.filter(
		(t) => t.workspaceId !== workspaceId || t.parentId,
	);

	const ungroupedTabs = newWorkspaceTabs.filter((t) =>
		childTabIds.includes(t.id),
	);
	const nonUngroupedTabs = newWorkspaceTabs.filter(
		(t) => !childTabIds.includes(t.id),
	);

	nonUngroupedTabs.splice(groupIndex, 0, ...ungroupedTabs);

	const finalTabs = [...otherTabs, ...nonUngroupedTabs];

	// Update active tab if the group was active to prevent UI confusion
	const currentActiveId = state.activeTabIds[workspaceId];
	const historyStack = state.tabHistoryStacks[workspaceId] || [];
	const newHistoryStack = historyStack.filter((id) => id !== groupId);

	const newActiveTabIds = { ...state.activeTabIds };
	if (currentActiveId === groupId) {
		if (ungroupedTabs.length > 0) {
			newActiveTabIds[workspaceId] = ungroupedTabs[0].id;
		} else if (nonUngroupedTabs.length > 0) {
			newActiveTabIds[workspaceId] = nonUngroupedTabs[0].id;
		} else {
			newActiveTabIds[workspaceId] = null;
		}
	}

	return {
		tabs: finalTabs,
		activeTabIds: newActiveTabIds,
		tabHistoryStacks: {
			...state.tabHistoryStacks,
			[workspaceId]: newHistoryStack,
		},
	};
};

