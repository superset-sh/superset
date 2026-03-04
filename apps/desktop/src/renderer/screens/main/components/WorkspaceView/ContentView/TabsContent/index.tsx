import { useParams } from "@tanstack/react-router";
import { useMemo } from "react";
import { useTabsStore } from "renderer/stores/tabs/store";
import { resolveActiveTabIdForWorkspace } from "renderer/stores/tabs/utils";
import { EmptyTabView } from "./EmptyTabView";
import { TabView } from "./TabView";
import { getWorkspaceTabsToRender } from "./utils";

export function TabsContent() {
	const { workspaceId: activeWorkspaceId } = useParams({ strict: false });
	const allTabs = useTabsStore((s) => s.tabs);
	const activeTabIds = useTabsStore((s) => s.activeTabIds);
	const tabHistoryStacks = useTabsStore((s) => s.tabHistoryStacks);

	const activeTabId = useMemo(() => {
		if (!activeWorkspaceId) return null;

		const resolvedActiveTabId = resolveActiveTabIdForWorkspace({
			workspaceId: activeWorkspaceId,
			tabs: allTabs,
			activeTabIds,
			tabHistoryStacks,
		});
		if (!resolvedActiveTabId) return null;

		const tab = allTabs.find((t) => t.id === resolvedActiveTabId) || null;
		if (!tab || tab.workspaceId !== activeWorkspaceId) return null;
		return resolvedActiveTabId;
	}, [activeWorkspaceId, activeTabIds, allTabs, tabHistoryStacks]);

	// All workspace tabs are kept mounted so BrowserPane (and its Electron
	// <webview>) is never unmounted during a tab switch. Inactive tabs are
	// hidden via CSS — not removed from the DOM — to avoid the webview
	// reparenting that would trigger a full page reload (#1834).
	const workspaceTabs = useMemo(
		() => getWorkspaceTabsToRender(allTabs, activeWorkspaceId),
		[allTabs, activeWorkspaceId],
	);

	return (
		<div className="relative flex-1 min-h-0 overflow-hidden">
			{workspaceTabs.length === 0 ? (
				<EmptyTabView />
			) : (
				workspaceTabs.map((tab) => (
					<div
						key={tab.id}
						className="absolute inset-0 flex"
						style={{ display: tab.id === activeTabId ? "flex" : "none" }}
					>
						<TabView tab={tab} />
					</div>
				))
			)}
		</div>
	);
}
