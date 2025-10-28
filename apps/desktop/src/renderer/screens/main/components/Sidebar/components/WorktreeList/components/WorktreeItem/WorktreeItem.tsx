import { ChevronRight, FolderOpen, GitBranch } from "lucide-react";
import { useEffect, useState } from "react";
import type { Worktree } from "shared/types";
import { Button } from "@superset/ui/button";
import { TabItem } from "./components/TabItem";

interface WorktreeItemProps {
	worktree: Worktree;
	isExpanded: boolean;
	onToggle: (worktreeId: string) => void;
	onTabSelect: (worktreeId: string, tabGroupId: string, tabId: string) => void;
	onTabGroupSelect: (worktreeId: string, tabGroupId: string) => void;
	selectedTabId?: string;
	selectedTabGroupId?: string;
}

export function WorktreeItem({
	worktree,
	isExpanded,
	onToggle,
	onTabSelect,
	onTabGroupSelect,
	selectedTabId,
	selectedTabGroupId,
}: WorktreeItemProps) {
	// Track which tab groups are expanded
	const [expandedTabGroups, setExpandedTabGroups] = useState<Set<string>>(
		new Set(),
	);

	// Auto-expand tab group if it's selected or contains the selected tab
	useEffect(() => {
		if (selectedTabGroupId) {
			// Check if this tab group is selected or contains the selected tab
			const tabGroup = worktree.tabGroups.find(
				(tg) => tg.id === selectedTabGroupId,
			);
			if (tabGroup) {
				setExpandedTabGroups((prev) => {
					const next = new Set(prev);
					next.add(selectedTabGroupId);
					return next;
				});
			}
		}
	}, [selectedTabGroupId, selectedTabId, worktree.tabGroups]);

	const toggleTabGroup = (tabGroupId: string) => {
		setExpandedTabGroups((prev) => {
			const next = new Set(prev);
			if (next.has(tabGroupId)) {
				next.delete(tabGroupId);
			} else {
				next.add(tabGroupId);
			}
			return next;
		});
	};

	return (
		<div className="space-y-1">
			{/* Worktree Header */}
			<Button
				variant="ghost"
				size="sm"
				onClick={() => onToggle(worktree.id)}
				className="w-full h-8 px-3 pb-1 font-normal"
				style={{ justifyContent: "flex-start" }}
			>
				<ChevronRight
					size={12}
					className={`transition-transform ${isExpanded ? "rotate-90" : ""}`}
				/>
				<GitBranch size={14} className="opacity-70" />
				<span className="truncate flex-1 text-left">{worktree.branch}</span>
			</Button>

			{/* Tab Groups and Tabs List */}
			{isExpanded && (
				<div className="ml-6 space-y-1">
					{(worktree.tabGroups || []).map((tabGroup) => (
						<div key={tabGroup.id} className="space-y-1">
							{/* Tab Group Header */}
							<Button
								variant="ghost"
								size="sm"
								onClick={() => {
									// Select the tab group (make it active)
									onTabGroupSelect(worktree.id, tabGroup.id);
									// Also toggle expansion
									toggleTabGroup(tabGroup.id);
								}}
								className={`w-full h-8 px-3 font-normal ${
									selectedTabGroupId === tabGroup.id && !selectedTabId
										? "bg-neutral-800 border border-neutral-700"
										: ""
								}`}
								style={{ justifyContent: "flex-start" }}
							>
								<ChevronRight
									size={12}
									className={`transition-transform ${
										expandedTabGroups.has(tabGroup.id) ? "rotate-90" : ""
									}`}
								/>
								<FolderOpen size={14} className="opacity-70" />
								<span className="truncate">{tabGroup.name}</span>
							</Button>

							{/* Tabs List */}
							{expandedTabGroups.has(tabGroup.id) && (
								<div className="ml-6 space-y-1">
									{tabGroup.tabs.map((tab) => (
										<TabItem
											key={tab.id}
											tab={tab}
											worktreeId={worktree.id}
											tabGroupId={tabGroup.id}
											selectedTabId={selectedTabId}
											onTabSelect={onTabSelect}
										/>
									))}
								</div>
							)}
						</div>
					))}
				</div>
			)}
		</div>
	);
}
