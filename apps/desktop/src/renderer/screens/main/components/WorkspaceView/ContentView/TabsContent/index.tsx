import type { ExternalApp } from "@superset/local-db";
import { useParams } from "@tanstack/react-router";
import { useMemo } from "react";
import { useTabsStore } from "renderer/stores/tabs/store";
import { resolveActiveTabIdForWorkspace } from "renderer/stores/tabs/utils";
import { EmptyTabView } from "./EmptyTabView";
import { TabView } from "./TabView";
import { PersistentTerminal } from "./Terminal/PersistentTerminal";

interface TabsContentProps {
	defaultExternalApp?: ExternalApp | null;
	onOpenInApp: () => void;
	onOpenQuickOpen: () => void;
}

export function TabsContent({
	defaultExternalApp,
	onOpenInApp,
	onOpenQuickOpen,
}: TabsContentProps) {
	const { workspaceId: activeWorkspaceId } = useParams({ strict: false });
	const allTabs = useTabsStore((s) => s.tabs);
	const allPanes = useTabsStore((s) => s.panes);
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

	const tabToRender = useMemo(() => {
		if (!activeTabId) return null;
		return allTabs.find((tab) => tab.id === activeTabId) || null;
	}, [activeTabId, allTabs]);

	const workspaceTerminalPanes = useMemo(() => {
		if (!activeWorkspaceId) return [];

		const workspaceTabIds = new Set(
			allTabs
				.filter((tab) => tab.workspaceId === activeWorkspaceId)
				.map((tab) => tab.id),
		);

		return Object.entries(allPanes)
			.filter(
				([, pane]) =>
					pane.type === "terminal" && workspaceTabIds.has(pane.tabId),
			)
			.map(([paneId, pane]) => ({
				paneId,
				tabId: pane.tabId,
				workspaceId: activeWorkspaceId,
			}));
	}, [activeWorkspaceId, allPanes, allTabs]);

	return (
		<div className="flex-1 min-h-0 flex overflow-hidden">
			{workspaceTerminalPanes.map(({ paneId, tabId, workspaceId }) => (
				<PersistentTerminal
					key={paneId}
					paneId={paneId}
					tabId={tabId}
					workspaceId={workspaceId}
				/>
			))}
			{tabToRender ? (
				<TabView key={tabToRender.id} tab={tabToRender} />
			) : (
				<EmptyTabView
					defaultExternalApp={defaultExternalApp}
					onOpenInApp={onOpenInApp}
					onOpenQuickOpen={onOpenQuickOpen}
				/>
			)}
		</div>
	);
}
