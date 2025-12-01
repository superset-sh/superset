import { useWindowsStore } from "./store";

// Window hooks
export const useWindows = () => useWindowsStore((state) => state.windows);
export const usePanes = () => useWindowsStore((state) => state.panes);
export const useActiveWindowIds = () =>
	useWindowsStore((state) => state.activeWindowIds);
export const useFocusedPaneIds = () =>
	useWindowsStore((state) => state.focusedPaneIds);

export const useAddWindow = () => useWindowsStore((state) => state.addWindow);
export const useRemoveWindow = () =>
	useWindowsStore((state) => state.removeWindow);
export const useRenameWindow = () =>
	useWindowsStore((state) => state.renameWindow);
export const useSetActiveWindow = () =>
	useWindowsStore((state) => state.setActiveWindow);
export const useReorderWindows = () =>
	useWindowsStore((state) => state.reorderWindows);
export const useReorderWindowById = () =>
	useWindowsStore((state) => state.reorderWindowById);
export const useUpdateWindowLayout = () =>
	useWindowsStore((state) => state.updateWindowLayout);

// Pane hooks
export const useAddPane = () => useWindowsStore((state) => state.addPane);
export const useRemovePane = () => useWindowsStore((state) => state.removePane);
export const useSetFocusedPane = () =>
	useWindowsStore((state) => state.setFocusedPane);
export const useMarkPaneAsUsed = () =>
	useWindowsStore((state) => state.markPaneAsUsed);
export const useSetNeedsAttention = () =>
	useWindowsStore((state) => state.setNeedsAttention);

// Split hooks
export const useSplitPaneVertical = () =>
	useWindowsStore((state) => state.splitPaneVertical);
export const useSplitPaneHorizontal = () =>
	useWindowsStore((state) => state.splitPaneHorizontal);

// Query hooks
export const useGetWindowsByWorkspace = () =>
	useWindowsStore((state) => state.getWindowsByWorkspace);
export const useGetActiveWindow = () =>
	useWindowsStore((state) => state.getActiveWindow);
export const useGetPanesForWindow = () =>
	useWindowsStore((state) => state.getPanesForWindow);
export const useGetFocusedPane = () =>
	useWindowsStore((state) => state.getFocusedPane);

// Derived state hooks (efficient selectors)
export const useWindowNeedsAttention = (windowId: string) =>
	useWindowsStore((state) =>
		Object.values(state.panes).some(
			(p) => p.windowId === windowId && p.needsAttention,
		),
	);
