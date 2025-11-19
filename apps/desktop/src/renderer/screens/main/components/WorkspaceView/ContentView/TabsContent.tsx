import { useMemo } from "react";
import {
	TabType,
	useActiveTabIds,
	useTabs,
	useWorkspacesStore,
} from "renderer/stores";

export function TabsContent() {
	const activeWorkspaceId = useWorkspacesStore(
		(state) => state.activeWorkspaceId,
	);
	const allTabs = useTabs();
	const activeTabIds = useActiveTabIds();

	const activeTab = useMemo(() => {
		if (!activeWorkspaceId) return null;
		const activeTabId = activeTabIds[activeWorkspaceId];
		if (!activeTabId) return null;
		return allTabs.find((tab) => tab.id === activeTabId) || null;
	}, [activeWorkspaceId, activeTabIds, allTabs]);

	if (!activeTab) {
		return (
			<div className="flex-1 h-full overflow-auto ">
				<div className="h-full w-full p-6">
					<div className="flex items-center justify-center h-full">
						<div className="text-center">
							<h2 className="text-2xl font-semibold text-foreground mb-2">
								No Active Tab
							</h2>
							<p className="text-muted-foreground">
								Create a new tab to get started
							</p>
						</div>
					</div>
				</div>
			</div>
		);
	}

	// Render different content based on tab type
	if (activeTab.type === TabType.Single) {
		return (
			<div className="flex-1 h-full overflow-auto bg-background">
				<div className="h-full w-full p-6">
					<div className="flex flex-col h-full">
						<div className="mb-4">
							<h2 className="text-2xl font-semibold text-foreground mb-1">
								{activeTab.title}
							</h2>
							<p className="text-sm text-muted-foreground">Single tab view</p>
						</div>
						<div className="flex-1 border border-border rounded-lg p-4">
							<p className="text-muted-foreground">
								Tab content will appear here
							</p>
						</div>
					</div>
				</div>
			</div>
		);
	}

	// Tab group view with react-mosaic
	return (
		<div className="flex-1 h-full overflow-auto bg-background">
			<div className="h-full w-full p-6">
				<div className="flex flex-col h-full">
					<div className="mb-4">
						<h2 className="text-2xl font-semibold text-foreground mb-1">
							{activeTab.title}
						</h2>
						<p className="text-sm text-muted-foreground">
							Split view - {Object.keys(activeTab.panes).length} panes
						</p>
					</div>
					<div className="flex-1 border border-border rounded-lg p-4">
						<p className="text-muted-foreground">
							React-mosaic split view will appear here
						</p>
						<div className="mt-2 text-xs text-muted-foreground">
							{Object.entries(activeTab.panes).map(([paneId, pane]) => (
								<div key={paneId}>
									- {pane.title} ({paneId})
								</div>
							))}
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}
