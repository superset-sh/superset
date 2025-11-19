import { create } from "zustand";
import { devtools } from "zustand/middleware";

export interface Tab {
	id: string;
	title: string;
}

interface TabsState {
	tabs: Tab[];
	activeTabId: string | null;

	addTab: () => void;
	removeTab: (id: string) => void;
	setActiveTab: (id: string) => void;
	reorderTabs: (startIndex: number, endIndex: number) => void;
}

const createNewTab = (): Tab => ({
	id: `tab-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`,
	title: "New Tab",
});

export const useTabsStore = create<TabsState>()(
	devtools(
		(set) => ({
			tabs: [{ id: "tab-1", title: "Home" }],
			activeTabId: "tab-1",

			addTab: () => {
				const newTab = createNewTab();
				set((state) => ({
					tabs: [...state.tabs, newTab],
					activeTabId: newTab.id,
				}));
			},

			removeTab: (id) => {
				set((state) => {
					const tabs = state.tabs.filter((tab) => tab.id !== id);
					if (tabs.length === 0) {
						const newTab = createNewTab();
						return { tabs: [newTab], activeTabId: newTab.id };
					}

					if (id === state.activeTabId) {
						const closedIndex = state.tabs.findIndex((tab) => tab.id === id);
						const nextTab = tabs[closedIndex] || tabs[closedIndex - 1];
						return { tabs, activeTabId: nextTab.id };
					}

					return { tabs };
				});
			},

			setActiveTab: (id) => {
				set({ activeTabId: id });
			},

			reorderTabs: (startIndex, endIndex) => {
				set((state) => {
					const tabs = [...state.tabs];
					const [removed] = tabs.splice(startIndex, 1);
					tabs.splice(endIndex, 0, removed);
					return { tabs };
				});
			},
		}),
		{ name: "TabsStore" },
	),
);
