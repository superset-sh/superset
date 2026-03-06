import type { ExternalApp } from "@superset/local-db";
import { useParams } from "@tanstack/react-router";
import { useCallback } from "react";
import { useTabsStore } from "renderer/stores/tabs/store";
import { resolveActiveTabIdForWorkspace } from "renderer/stores/tabs/utils";
import { EmptyTabView } from "./EmptyTabView";
import { TabView } from "./TabView";

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
	const tabToRender = useTabsStore(
		useCallback(
			(state) => {
				if (!activeWorkspaceId) return null;

				const activeTabId = resolveActiveTabIdForWorkspace({
					workspaceId: activeWorkspaceId,
					tabs: state.tabs,
					activeTabIds: state.activeTabIds,
					tabHistoryStacks: state.tabHistoryStacks,
				});
				if (!activeTabId) return null;

				const tab = state.tabs.find(
					(candidate) => candidate.id === activeTabId,
				);
				return tab?.workspaceId === activeWorkspaceId ? tab : null;
			},
			[activeWorkspaceId],
		),
	);

	return (
		<div className="flex-1 min-h-0 flex overflow-hidden">
			{tabToRender ? (
				<TabView tab={tabToRender} />
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
