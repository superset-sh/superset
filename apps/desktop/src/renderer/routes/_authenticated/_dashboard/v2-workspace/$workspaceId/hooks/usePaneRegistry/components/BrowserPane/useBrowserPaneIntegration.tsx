import type { Tab, WorkspaceStore } from "@superset/panes";
import { useCallback, useEffect, useRef } from "react";
import type { StoreApi } from "zustand";
import { useStore } from "zustand";
import type { PaneViewerData } from "../../../../types";
import { browserRuntimeRegistry } from "./browserRuntimeRegistry";
import { BrowserTabLabel } from "./components/BrowserTabLabel";

function getSingleBrowserPaneId(tab: Tab<PaneViewerData>): string | null {
	const paneIds = Object.keys(tab.panes);
	if (paneIds.length !== 1) return null;
	const pane = tab.panes[paneIds[0]];
	return pane.kind === "browser" ? pane.id : null;
}

export function useBrowserPaneIntegration(
	store: StoreApi<WorkspaceStore<PaneViewerData>>,
) {
	const browserPaneIdsRef = useRef<Set<string>>(new Set());
	const tabs = useStore(store, (s) => s.tabs);

	useEffect(() => {
		const current = new Set<string>();
		for (const tab of tabs) {
			for (const pane of Object.values(tab.panes)) {
				if (pane.kind === "browser") current.add(pane.id);
			}
		}
		for (const prevId of browserPaneIdsRef.current) {
			if (!current.has(prevId)) {
				browserRuntimeRegistry.destroy(prevId);
			}
		}
		browserPaneIdsRef.current = current;
	}, [tabs]);

	const getTabTitle = useCallback((tab: Tab<PaneViewerData>): string => {
		const browserPaneId = getSingleBrowserPaneId(tab);
		if (browserPaneId) {
			const state = browserRuntimeRegistry.getState(browserPaneId);
			if (state.pageTitle) return state.pageTitle;
			if (state.currentUrl && state.currentUrl !== "about:blank") {
				try {
					return new URL(state.currentUrl).hostname;
				} catch {}
			}
		}
		return tab.titleOverride ?? tab.id;
	}, []);

	const renderTabLabel = useCallback((tab: Tab<PaneViewerData>) => {
		const browserPaneId = getSingleBrowserPaneId(tab);
		if (!browserPaneId) return null;
		return (
			<BrowserTabLabel
				paneId={browserPaneId}
				fallbackTitle={tab.titleOverride ?? "Browser"}
			/>
		);
	}, []);

	return { getTabTitle, renderTabLabel };
}
