import { Button } from "@superset/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { cn } from "@superset/ui/utils";
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
		<div className="group relative flex items-end shrink-0 h-full">
			<Tooltip>
				<TooltipTrigger asChild>
					<button
						type="button"
						onClick={onSelect}
						className={cn(
							"flex items-center gap-1.5 rounded-t-md transition-all w-full shrink-0 pl-3 pr-6 h-[80%]",
							isActive
								? "text-foreground bg-tertiary-active"
								: "text-muted-foreground hover:text-foreground hover:bg-tertiary/30",
						)}
					>
						<span className="text-sm whitespace-nowrap overflow-hidden flex-1 text-left">
							{displayName}
						</span>
						{needsAttention && (
							<span className="relative flex size-2 shrink-0">
								<span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
								<span className="relative inline-flex size-2 rounded-full bg-red-500" />
							</span>
						)}
					</button>
				</TooltipTrigger>
				<TooltipContent side="bottom" sideOffset={4}>
					{displayName}
				</TooltipContent>
			</Tooltip>
			<Tooltip delayDuration={500}>
				<TooltipTrigger asChild>
					<Button
						type="button"
						variant="ghost"
						size="icon"
						onClick={(e) => {
							e.stopPropagation();
							onClose();
						}}
						className={cn(
							"mt-1 absolute right-1 top-1/2 -translate-y-1/2 cursor-pointer size-5 group-hover:opacity-100",
							isActive ? "opacity-90" : "opacity-0",
						)}
						aria-label="Close group"
					>
						<HiMiniXMark />
					</Button>
				</TooltipTrigger>
				<TooltipContent side="bottom" showArrow={false}>
					Close group
				</TooltipContent>
			</Tooltip>
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
		<div className="flex items-end gap-1 px-2 h-10 bg-background shrink-0">
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
