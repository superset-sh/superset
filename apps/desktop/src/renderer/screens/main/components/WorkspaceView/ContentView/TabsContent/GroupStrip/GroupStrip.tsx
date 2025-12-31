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
	isSidebarMode: boolean;
	onSelect: () => void;
	onClose: () => void;
}

function GroupItem({
	tab,
	isActive,
	needsAttention,
	isSidebarMode,
	onSelect,
	onClose,
}: GroupItemProps) {
	const displayName = getTabDisplayName(tab);

	if (isSidebarMode) {
		// Sidebar mode: browser-tab style matching workspace tabs
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

	// Top-bar mode: original pill style
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
	const { data: navigationStyle } = trpc.settings.getNavigationStyle.useQuery();
	const isSidebarMode = navigationStyle === "sidebar";
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
		<div
			className={cn(
				"flex gap-1 px-2 bg-background shrink-0",
				isSidebarMode
					? "items-end h-10"
					: "items-center py-1 border-b border-border",
			)}
		>
			{tabs.length > 0 && (
				<div
					className={cn(
						"flex gap-0.5 overflow-x-auto scrollbar-none",
						isSidebarMode ? "items-end h-full" : "items-center gap-1",
					)}
				>
					{tabs.map((tab) => (
						<div
							key={tab.id}
							className={isSidebarMode ? "h-full shrink-0" : undefined}
							style={isSidebarMode ? { width: "120px" } : undefined}
						>
							<GroupItem
								tab={tab}
								isActive={tab.id === activeTabId}
								needsAttention={tabsWithAttention.has(tab.id)}
								isSidebarMode={isSidebarMode}
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
						className={cn("shrink-0", isSidebarMode ? "size-7 mb-1" : "size-6")}
						onClick={handleAddGroup}
					>
						<HiMiniPlus className={isSidebarMode ? "size-4" : "size-3.5"} />
					</Button>
				</TooltipTrigger>
				<TooltipContent side="bottom" sideOffset={4}>
					New Group
				</TooltipContent>
			</Tooltip>
		</div>
	);
}
