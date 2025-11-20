import { Button } from "@superset/ui/button";
import type React from "react";
import { useMemo } from "react";
import { HiMiniPlus } from "react-icons/hi2";
import { useAddTab, useTabs, useWorkspacesStore } from "renderer/stores";
import { TabItem } from "./TabItem";
import { UngroupDropZone } from "./UngroupDropZone";

export function TabsView() {
	const activeWorkspaceId = useWorkspacesStore(
		(state) => state.activeWorkspaceId,
	);
	const allTabs = useTabs();
	const addTab = useAddTab();

	const tabs = useMemo(
		() =>
			activeWorkspaceId
				? allTabs.filter(
						(tab) => tab.workspaceId === activeWorkspaceId && !tab.parentId,
					)
				: [],
		[activeWorkspaceId, allTabs],
	);

	const getChildTabs = (parentId: string) =>
		allTabs.filter((tab) => tab.parentId === parentId);

	const handleAddTab = () => {
		if (activeWorkspaceId) {
			addTab(activeWorkspaceId);
		}
	};

	return (
		<nav className="space-y-2 flex flex-col h-full p-2">
			<UngroupDropZone>
				{(draggedTab, isDragOver, dropIndex) => {
					const items: React.ReactNode[] = [];

					tabs.forEach((tab, index) => {
						// Add preview before this tab if needed
						if (isDragOver && draggedTab && index === dropIndex) {
							items.push(
								<Button
									key={`preview-${draggedTab.id}`}
									variant="ghost"
									className="w-full text-start px-3 py-2 rounded-md bg-sidebar-accent border-2 border-dashed border-sidebar-accent pointer-events-none"
								>
									<span className="truncate flex-1">{draggedTab.title}</span>
								</Button>,
							);
						}

						// Add the actual tab
						items.push(
							<div
								key={tab.id}
								data-tab-item
								className={isDragOver && draggedTab ? "opacity-50" : ""}
							>
								<TabItem tab={tab} childTabs={getChildTabs(tab.id)} />
							</div>,
						);
					});

					// Add preview at the end if needed
					if (isDragOver && draggedTab && dropIndex >= tabs.length) {
						items.push(
							<Button
								key={`preview-${draggedTab.id}`}
								variant="ghost"
								className="w-full text-start px-3 py-2 rounded-md bg-sidebar-accent border-2 border-dashed border-sidebar-accent pointer-events-none"
							>
								<span className="truncate flex-1">{draggedTab.title}</span>
							</Button>,
						);
					}

					return (
						<div className="text-sm text-sidebar-foreground space-y-1">
							{items}
							<Button
								variant="ghost"
								onClick={handleAddTab}
								className="w-full text-start group px-3 py-2 rounded-md cursor-pointer flex items-center justify-between"
								disabled={!activeWorkspaceId}
							>
								<HiMiniPlus className="size-4" />
								<span className="truncate flex-1">New Tab</span>
							</Button>
						</div>
					);
				}}
			</UngroupDropZone>
		</nav>
	);
}
