import type { Tab } from "../types";
import { TabType } from "../types";
import { cleanLayout } from "../drag-logic";
import { getChildTabIds } from "../utils";

/**
 * Validates and cleans all group tabs to ensure layout only contains valid child IDs
 */
export const validateGroupLayouts = (tabs: Tab[]): Tab[] => {
	return tabs.map((tab) => {
		if (tab.type !== TabType.Group) return tab;

		// Derive children from parentId
		const validTabIds = new Set(getChildTabIds(tabs, tab.id));
		const cleanedLayout = cleanLayout(tab.layout, validTabIds);

		// Only update if layout actually changed
		if (cleanedLayout !== tab.layout) {
			return {
				...tab,
				layout: cleanedLayout,
			};
		}

		return tab;
	});
};

