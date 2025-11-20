import { Button } from "@superset/ui/button";
import { useState } from "react";
import { HiChevronRight, HiMiniXMark } from "react-icons/hi2";
import {
	useRemoveTab,
	useSetActiveTab,
	useWorkspacesStore,
} from "renderer/stores";
import { TabType } from "renderer/stores/tabs/types";
import type { TabItemProps } from "./types";
import { useDragTab } from "./useDragTab";

export function TabItem({ tab, isActive }: TabItemProps) {
	const [isExpanded, setIsExpanded] = useState(true);
	const activeWorkspaceId = useWorkspacesStore(
		(state) => state.activeWorkspaceId,
	);
	const removeTab = useRemoveTab();
	const setActiveTab = useSetActiveTab();

	const { drag, drop, isDragging, isDragOver } = useDragTab(tab.id);

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

	const handlePaneClick = (_paneId: string) => {
		// Make the parent group tab active when a child pane is clicked
		if (activeWorkspaceId) {
			setActiveTab(activeWorkspaceId, tab.id);
			// TODO: Track active pane within group tab
		}
	};

	const handleRemovePane = (
		e: React.MouseEvent<HTMLButtonElement>,
		paneId: string,
	) => {
		e.stopPropagation();
		// TODO: Implement pane removal from group
		console.log("Remove pane:", paneId);
	};

	// Combine drag and drop refs
	const attachRef = (el: HTMLButtonElement | null) => {
		drag(el);
		drop(el);
	};

	const isGroupTab = tab.type === TabType.Group;
	const childPanes = isGroupTab ? Object.entries(tab.panes) : [];

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
					${isDragging ? "opacity-50 cursor-grabbing" : ""}
					${isDragOver ? "bg-sidebar-accent/50" : ""}
				`}
			>
				<div className="flex items-center gap-1 flex-1 min-w-0">
					{isGroupTab && (
						<button
							type="button"
							onClick={handleToggleExpand}
							className="shrink-0"
						>
							<HiChevronRight
								className={`size-3 transition-transform ${isExpanded ? "rotate-90" : ""}`}
							/>
						</button>
					)}
					<span className="truncate flex-1">{tab.title}</span>
				</div>
				{!isGroupTab && (
					<button
						type="button"
						onClick={handleRemoveTab}
						className="opacity-0 group-hover:opacity-100 ml-2 text-xs hover:text-destructive shrink-0"
					>
						<HiMiniXMark className="size-4" />
					</button>
				)}
			</Button>

			{isGroupTab && isExpanded && (
				<div className="ml-4 mt-1 space-y-1">
					{childPanes.map(([paneId, pane]) => (
						<button
							type="button"
							key={paneId}
							className="w-full px-3 py-1.5 text-sm text-muted-foreground rounded-md hover:bg-sidebar-accent/50 cursor-pointer flex items-center gap-2 group"
							onClick={() => handlePaneClick(paneId)}
						>
							<span className="text-xs opacity-50">└</span>
							<span className="truncate flex-1 text-start">{pane.title}</span>
							<button
								type="button"
								onClick={(e) => handleRemovePane(e, paneId)}
								className="opacity-0 group-hover:opacity-100 ml-2 text-xs hover:text-destructive shrink-0"
							>
								<HiMiniXMark className="size-4" />
							</button>
						</button>
					))}
				</div>
			)}
		</div>
	);
}
