import { Button } from "@superset/ui/button";
import { useState } from "react";
import { HiChevronRight, HiMiniXMark } from "react-icons/hi2";
import {
	useActiveTabIds,
	useRemoveTab,
	useSetActiveTab,
	useWorkspacesStore,
} from "renderer/stores";
import { TabType } from "renderer/stores/tabs/types";
import type { TabItemProps } from "./types";
import { useDragTab } from "./useDragTab";
import { useGroupDrop } from "./useGroupDrop";

export function TabItem({ tab, childTabs = [] }: TabItemProps) {
	const [isExpanded, setIsExpanded] = useState(true);
	const activeWorkspaceId = useWorkspacesStore(
		(state) => state.activeWorkspaceId,
	);
	const activeTabIds = useActiveTabIds();
	const removeTab = useRemoveTab();
	const setActiveTab = useSetActiveTab();

	const activeTabId = activeWorkspaceId
		? activeTabIds[activeWorkspaceId]
		: null;
	const isActive = tab.id === activeTabId;

	const { drag, drop, isDragging, isDragOver } = useDragTab(tab.id);
	const groupDrop = useGroupDrop(tab.id);

	const handleRemoveTab = (e: React.MouseEvent) => {
		e.stopPropagation();
		removeTab(tab.id);
	};

	const handleTabClick = () => {
		if (activeWorkspaceId) {
			setActiveTab(activeWorkspaceId, tab.id);
		}
	};

	const handleToggleExpand = (e: React.MouseEvent) => {
		e.stopPropagation();
		setIsExpanded(!isExpanded);
	};

	const attachRef = (el: HTMLButtonElement | null) => {
		drag(el);
		drop(el);
	};

	const isGroupTab = tab.type === TabType.Group;
	const hasChildren = childTabs.length > 0;

	return (
		<div className="w-full">
			<Button
				ref={attachRef}
				variant="ghost"
				onClick={handleTabClick}
				onKeyDown={(e) => {
					if (e.key === "Enter" || e.key === " ") {
						e.preventDefault();
						handleTabClick();
					}
				}}
				tabIndex={0}
				className={`
					w-full text-start group px-3 py-2 rounded-md cursor-pointer flex items-center justify-between
					${isActive ? "bg-sidebar-accent" : ""}
					${isDragging ? "opacity-50" : ""}
					${isDragOver ? "bg-sidebar-accent/50" : ""}
				`}
			>
				<div className="flex items-center gap-1 flex-1 min-w-0">
					{isGroupTab && hasChildren && (
						<button
							type="button"
							onClick={handleToggleExpand}
							className="shrink-0 cursor-pointer hover:opacity-80"
						>
							<HiChevronRight
								className={`size-4 transition-transform ${isExpanded ? "rotate-90" : ""}`}
							/>
						</button>
					)}
					<span className="truncate flex-1">{tab.title}</span>
				</div>
				{!isGroupTab && (
					<button
						type="button"
						onClick={handleRemoveTab}
						className="opacity-0 group-hover:opacity-100 ml-2 text-xs shrink-0"
					>
						<HiMiniXMark className="size-4" />
					</button>
				)}
			</Button>

			{isGroupTab && hasChildren && isExpanded && (
				<div
					ref={(node) => {
						groupDrop.drop(node);
					}}
					className="ml-4 mt-1 space-y-1 relative"
				>
					{groupDrop.isDragOver && (
						<div className="absolute -top-px left-0 right-0 h-0.5 bg-primary rounded-full z-20 pointer-events-none" />
					)}
					{childTabs.map((childTab) => {
						return (
							<div key={childTab.id} className="flex items-start gap-1">
								<div className="flex-1">
									<TabItem tab={childTab} childTabs={[]} />
								</div>
							</div>
						);
					})}
				</div>
			)}
		</div>
	);
}
