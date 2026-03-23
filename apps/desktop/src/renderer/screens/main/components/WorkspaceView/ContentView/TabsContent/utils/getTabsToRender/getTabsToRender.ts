import type { Pane, Tab } from "renderer/stores/tabs/types";
import { extractPaneIdsFromLayout } from "renderer/stores/tabs/utils";

interface GetTabsToRenderOptions {
	activeTabId: string | null;
	tabs: Tab[];
	panes: Record<string, Pane>;
}

function tabHasBrowserPane(tab: Tab, panes: Record<string, Pane>): boolean {
	for (const paneId of extractPaneIdsFromLayout(tab.layout)) {
		if (panes[paneId]?.type === "webview") {
			return true;
		}
	}

	return false;
}

export function getTabsToRender({
	activeTabId,
	tabs,
	panes,
}: GetTabsToRenderOptions): Tab[] {
	const tabsToRender: Tab[] = [];
	const seenTabIds = new Set<string>();

	const pushTab = (tab: Tab | null | undefined) => {
		if (!tab || seenTabIds.has(tab.id)) return;
		seenTabIds.add(tab.id);
		tabsToRender.push(tab);
	};

	pushTab(tabs.find((tab) => tab.id === activeTabId));

	// Intentionally keep browser-bearing tabs mounted across workspaces so their
	// webviews preserve page state while hidden during workspace switches.
	for (const tab of tabs) {
		if (tab.id === activeTabId) continue;
		if (!tabHasBrowserPane(tab, panes)) continue;
		pushTab(tab);
	}

	return tabsToRender;
}
