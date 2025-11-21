import { Button } from "@superset/ui/button";
import { useState } from "react";
import { HiChevronRight, HiMiniXMark } from "react-icons/hi2";
import {
	useActiveTabIds,
	useRemoveTab,
	useSetActiveTab,
	useTabs,
	useUngroupTab,
	useUngroupTabs,
} from "renderer/stores";
import { trpc } from "renderer/lib/trpc";
import { TabType } from "renderer/stores/tabs/types";
import { TabContextMenu } from "./TabContextMenu";
import type { TabItemProps } from "./types";
import { useDragTab } from "./useDragTab";
import { useGroupDrop } from "./useGroupDrop";
import { useTabRename } from "./useTabRename";

export function TabItem({ tab, childTabs = [] }: TabItemProps) {
	const [isExpanded, setIsExpanded] = useState(true);
	const { data: activeWorkspace } = trpc.workspaces.getActive.useQuery();
	const activeWorkspaceId = activeWorkspace?.id;
	const activeTabIds = useActiveTabIds();
	const removeTab = useRemoveTab();
	const setActiveTab = useSetActiveTab();
	const ungroupTabs = useUngroupTabs();
	const ungroupTab = useUngroupTab();
	const tabs = useTabs();

	const activeTabId = activeWorkspaceId
		? activeTabIds[activeWorkspaceId]
		: null;
	const isActive = tab.id === activeTabId;

	const { drag, drop, isDragging, isDragOver } = useDragTab(tab.id);
	const groupDrop = useGroupDrop(tab.id);

	const rename = useTabRename(tab.id, tab.title);

	const handleRemoveTab = (e?: React.MouseEvent) => {
		e?.stopPropagation();
		removeTab(tab.id);
	};

	const handleTabClick = () => {
		if (rename.isRenaming) return;
		if (activeWorkspaceId) {
			setActiveTab(activeWorkspaceId, tab.id);
		}
	};

	const handleToggleExpand = (e: React.MouseEvent) => {
		e.stopPropagation();
		e.preventDefault();
		if (rename.isRenaming) return;
		setIsExpanded(!isExpanded);
	};

	const handleUngroup = () => {
		ungroupTabs(tab.id);
	};

	const handleMoveOutOfGroup = () => {
		if (!tab.parentId) return;

		// Find the parent group's index in the workspace tabs
		const workspaceTabs = tabs.filter(
			(t) => t.workspaceId === tab.workspaceId && !t.parentId,
		);
		const parentIndex = workspaceTabs.findIndex((t) => t.id === tab.parentId);

		// Place after the parent (parentIndex + 1)
		if (parentIndex !== -1) {
			ungroupTab(tab.id, parentIndex + 1);
		}
	};

	const attachRef = (el: HTMLButtonElement | null) => {
		drag(el);
		drop(el);
	};

	const isGroupTab = tab.type === TabType.Group;
	const hasChildren = childTabs.length > 0;

	return (
		<div className="w-full">
			<TabContextMenu
				tabId={tab.id}
				tabType={tab.type}
				hasParent={!!tab.parentId}
				onClose={handleRemoveTab}
				onRename={rename.startRename}
				onUngroup={isGroupTab ? handleUngroup : undefined}
				onMoveOutOfGroup={tab.parentId ? handleMoveOutOfGroup : undefined}
			>
				<Button
					ref={attachRef}
					variant="ghost"
					onClick={handleTabClick}
					onDoubleClick={rename.startRename}
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
							<div
								role="button"
								tabIndex={-1}
								onClick={handleToggleExpand}
								onDoubleClick={(e) => {
									e.stopPropagation();
									e.preventDefault();
								}}
								onKeyDown={(e) => {
									if (e.key === "Enter" || e.key === " ") {
										e.preventDefault();
										handleToggleExpand(e as unknown as React.MouseEvent);
									}
								}}
								className="shrink-0 cursor-pointer hover:opacity-80"
							>
								<HiChevronRight
									className={`size-4 transition-transform ${isExpanded ? "rotate-90" : ""}`}
								/>
							</div>
						)}
						{rename.isRenaming ? (
							<input
								ref={rename.inputRef}
								type="text"
								value={rename.renameValue}
								onChange={(e) => rename.setRenameValue(e.target.value)}
								onBlur={rename.submitRename}
								onKeyDown={rename.handleKeyDown}
								onClick={(e) => e.stopPropagation()}
								className="flex-1 bg-sidebar-accent border border-primary rounded px-1 py-0.5 text-sm outline-none"
							/>
						) : (
							<span className="truncate flex-1">{tab.title}</span>
						)}
					</div>
					{!isGroupTab && (
						<div
							role="button"
							tabIndex={-1}
							onClick={handleRemoveTab}
							onKeyDown={(e) => {
								if (e.key === "Enter" || e.key === " ") {
									e.preventDefault();
									handleRemoveTab();
								}
							}}
							className="cursor-pointer opacity-0 group-hover:opacity-100 ml-2 text-xs shrink-0"
						>
							<HiMiniXMark className="size-4" />
						</div>
					)}
				</Button>
			</TabContextMenu>

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
