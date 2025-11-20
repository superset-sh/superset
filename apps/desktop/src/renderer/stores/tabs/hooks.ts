import { useTabsStore } from "./store";

export const useTabs = () => useTabsStore((state) => state.tabs);
export const useActiveTabIds = () =>
	useTabsStore((state) => state.activeTabIds);

export const useAddTab = () => useTabsStore((state) => state.addTab);
export const useRemoveTab = () => useTabsStore((state) => state.removeTab);
export const useRenameTab = () => useTabsStore((state) => state.renameTab);
export const useSetActiveTab = () =>
	useTabsStore((state) => state.setActiveTab);
export const useReorderTabs = () => useTabsStore((state) => state.reorderTabs);
export const useReorderTabById = () =>
	useTabsStore((state) => state.reorderTabById);
export const useMarkTabAsUsed = () =>
	useTabsStore((state) => state.markTabAsUsed);
export const useUngroupTab = () => useTabsStore((state) => state.ungroupTab);
export const useUngroupTabs = () => useTabsStore((state) => state.ungroupTabs);
export const useSplitTabVertical = () =>
	useTabsStore((state) => state.splitTabVertical);
export const useSplitTabHorizontal = () =>
	useTabsStore((state) => state.splitTabHorizontal);

