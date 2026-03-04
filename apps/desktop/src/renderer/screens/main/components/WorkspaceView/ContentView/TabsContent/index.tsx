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

	// All workspace tabs are kept mounted simultaneously so their BrowserPanes
	// (and the <webview> elements inside them) are never removed from the DOM.
	// Visibility is controlled via CSS only — switching tabs never reparents
	// a <webview> element, which would otherwise trigger a full page reload in
	// Electron (issue #1935).
	const workspaceTabs = useMemo(
		() => getWorkspaceTabsToRender(allTabs, activeWorkspaceId ?? ""),
		[allTabs, activeWorkspaceId],
	);

	if (workspaceTabs.length === 0) {
		return (
			<div className="flex-1 min-h-0 flex overflow-hidden">
				<EmptyTabView />
			</div>
		);
	}

	return (
		<div className="flex-1 min-h-0 flex overflow-hidden">
			{workspaceTabs.map((tab) => (
				<div
					key={tab.id}
					className="flex-1 min-h-0 flex overflow-hidden"
					style={{ display: tab.id === activeTabId ? "flex" : "none" }}
				>
					<TabView tab={tab} />
				</div>
			))}
		</div>
	);
}
