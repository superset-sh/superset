import { Button } from "@superset/ui/button";
import { LayoutGroup, motion } from "framer-motion";
import { useMemo } from "react";
import { HiMiniPlus } from "react-icons/hi2";
import { trpc } from "renderer/lib/trpc";
import { useAddTab, useTabs } from "renderer/stores";
import { TabItem } from "./TabItem";
import { UngroupDropZone } from "./UngroupDropZone";

export function TabsView() {
	const { data: activeWorkspace } = trpc.workspaces.getActive.useQuery();
	const activeWorkspaceId = activeWorkspace?.id;
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
				{(draggedTab, isDragOver, dropIndex) => (
					<LayoutGroup>
						<Button
							variant="ghost"
							onClick={handleAddTab}
							className="w-full text-start group px-3 py-2 rounded-md cursor-pointer flex items-center justify-between"
							disabled={!activeWorkspaceId}
						>
							<HiMiniPlus className="size-4" />
							<span className="truncate flex-1">New Terminal</span>
						</Button>
						<div className="text-sm text-sidebar-foreground space-y-2 relative pt-2">
							{tabs.map((tab, index) => (
								<motion.div
									key={tab.id}
									layout
									initial={false}
									transition={{
										layout: { duration: 0.2, ease: "easeInOut" },
									}}
									className="relative"
								>
									{/* Drop line indicator before this tab */}
									{isDragOver && draggedTab && index === dropIndex && (
										<div className="absolute -top-px left-0 right-0 h-0.5 bg-primary rounded-full z-20 pointer-events-none" />
									)}
									<div data-tab-item>
										<TabItem tab={tab} childTabs={getChildTabs(tab.id)} />
									</div>
								</motion.div>
							))}
							{/* Drop line indicator at the end */}
							{isDragOver && draggedTab && dropIndex >= tabs.length && (
								<div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary rounded-full z-20 pointer-events-none" />
							)}
						</div>
					</LayoutGroup>
				)}
			</UngroupDropZone>
		</nav>
	);
}
