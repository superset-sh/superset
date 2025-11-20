import type { Tab } from "../types";
import { TabType } from "../types";
import { cleanLayout } from "../drag-logic";
import { getChildTabIds } from "../utils";

export const validateGroupLayouts = (tabs: Tab[]): Tab[] => {
	return tabs.map((tab) => {
		if (tab.type !== TabType.Group) return tab;

		// Layouts can reference removed tabs, so clean them to prevent broken references
		const validTabIds = new Set(getChildTabIds(tabs, tab.id));
		const cleanedLayout = cleanLayout(tab.layout, validTabIds);

		if (cleanedLayout !== tab.layout) {
			return {
				...tab,
				layout: cleanedLayout,
			};
		}

		return tab;
	});
};

