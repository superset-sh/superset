import { Button } from "@superset/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { useMemo } from "react";
import { HiMiniPlus, HiMiniXMark } from "react-icons/hi2";
import { trpc } from "renderer/lib/trpc";
import { useTabsStore } from "renderer/stores/tabs/store";
import type { Tab } from "renderer/stores/tabs/types";
import { getTabDisplayName } from "renderer/stores/tabs/utils";

interface GroupItemProps {
	tab: Tab;
	isActive: boolean;
	needsAttention: boolean;
	onSelect: () => void;
	onClose: () => void;
}

function GroupItem({
	tab,
	isActive,
	needsAttention,
	onSelect,
	onClose,
}: GroupItemProps) {
	const displayName = getTabDisplayName(tab);

	return (
		<div className="relative group flex items-center">
			<Tooltip>
				<TooltipTrigger asChild>
					<button
						type="button"
						onClick={onSelect}
						className={`
							px-3 py-1 text-xs rounded-md transition-colors flex items-center gap-1.5 max-w-[120px]
							${isActive ? "bg-accent text-accent-foreground" : "hover:bg-muted text-muted-foreground hover:text-foreground"}
						`}
					>
						<span className="truncate">{displayName}</span>
						{needsAttention && (
							<span className="relative flex size-1.5 shrink-0">
								<span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
								<span className="relative inline-flex size-1.5 rounded-full bg-red-500" />
							</span>
						)}
					</button>
				</TooltipTrigger>
				<TooltipContent side="bottom" sideOffset={4}>
					{displayName}
				</TooltipContent>
			</Tooltip>
			<button
				type="button"
				onClick={(e) => {
					e.stopPropagation();
					onClose();
				}}
				className="absolute -right-1.5 -top-1.5 p-1 rounded-full bg-muted opacity-0 group-hover:opacity-100 transition-opacity hover:bg-destructive hover:text-destructive-foreground"
			>
				<HiMiniXMark className="size-2" />
			</button>
		</div>
	);
}

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
		<div className="flex items-center gap-1 px-2 py-1 border-b border-border bg-background shrink-0">
			{tabs.length > 0 && (
				<div className="flex items-center gap-1 overflow-x-auto scrollbar-none">
					{tabs.map((tab) => (
						<GroupItem
							key={tab.id}
							tab={tab}
							isActive={tab.id === activeTabId}
							needsAttention={tabsWithAttention.has(tab.id)}
							onSelect={() => handleSelectGroup(tab.id)}
							onClose={() => handleCloseGroup(tab.id)}
						/>
					))}
				</div>
			)}
			<Tooltip>
				<TooltipTrigger asChild>
					<Button
						variant="ghost"
						size="icon"
						className="size-6 shrink-0"
						onClick={handleAddGroup}
					>
						<HiMiniPlus className="size-3.5" />
					</Button>
				</TooltipTrigger>
				<TooltipContent side="bottom" sideOffset={4}>
					New Group
				</TooltipContent>
			</Tooltip>
		</div>
	);
}
