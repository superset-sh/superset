import { Button } from "@superset/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { useMemo } from "react";
import { HiMiniPlus } from "react-icons/hi2";
import { trpc } from "renderer/lib/trpc";
import { useTabsStore } from "renderer/stores/tabs/store";
import { GroupItem } from "./GroupItem";

export function GroupStrip() {
	const { data: activeWorkspace } = trpc.workspaces.getActive.useQuery();
	const activeWorkspaceId = activeWorkspace?.id;

	const allTabs = useTabsStore((s) => s.tabs);
	const panes = useTabsStore((s) => s.panes);
	const activeTabIds = useTabsStore((s) => s.activeTabIds);
	const addTab = useTabsStore((s) => s.addTab);
	const removeTab = useTabsStore((s) => s.removeTab);
	const setActiveTab = useTabsStore((s) => s.setActiveTab);

	const tabs = useMemo(
		() =>
			activeWorkspaceId
				? allTabs.filter((tab) => tab.workspaceId === activeWorkspaceId)
				: [],
		[activeWorkspaceId, allTabs],
	);

	const activeTabId = activeWorkspaceId
		? activeTabIds[activeWorkspaceId]
		: null;

	// Check which tabs have panes that need attention
	const tabsWithAttention = useMemo(() => {
		const result = new Set<string>();
		for (const pane of Object.values(panes)) {
			if (pane.needsAttention) {
				result.add(pane.tabId);
			}
		}
		return result;
	}, [panes]);

	const handleAddGroup = () => {
		if (activeWorkspaceId) {
			addTab(activeWorkspaceId);
		}
	};

	const handleSelectGroup = (tabId: string) => {
		if (activeWorkspaceId) {
			setActiveTab(activeWorkspaceId, tabId);
		}
	};

	const handleCloseGroup = (tabId: string) => {
		removeTab(tabId);
	};

	return (
		<div className="flex items-end gap-1 px-2 h-10 flex-1 min-w-0">
			{tabs.length > 0 && (
				<div className="flex items-end gap-0.5 h-full overflow-x-auto scrollbar-none">
					{tabs.map((tab) => (
						<div
							key={tab.id}
							className="h-full shrink-0"
							style={{ width: "120px" }}
						>
							<GroupItem
								tab={tab}
								isActive={tab.id === activeTabId}
								needsAttention={tabsWithAttention.has(tab.id)}
								onSelect={() => handleSelectGroup(tab.id)}
								onClose={() => handleCloseGroup(tab.id)}
							/>
						</div>
					))}
				</div>
			)}
			<Tooltip>
				<TooltipTrigger asChild>
					<Button
						variant="ghost"
						size="icon"
						className="shrink-0 size-7 mb-1"
						onClick={handleAddGroup}
					>
						<HiMiniPlus className="size-4" />
					</Button>
				</TooltipTrigger>
				<TooltipContent side="bottom" sideOffset={4}>
					New Group
				</TooltipContent>
			</Tooltip>
		</div>
	);
}
