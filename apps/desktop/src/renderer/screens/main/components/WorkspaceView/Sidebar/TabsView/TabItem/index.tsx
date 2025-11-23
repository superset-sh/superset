import { Button } from "@superset/ui/button";
import { useState } from "react";
import { HiChevronRight, HiMiniXMark } from "react-icons/hi2";
import { trpc } from "renderer/lib/trpc";
import {
	useRemoveTab,
	useSetActiveTab,
	useUngroup,
	useMoveOutOfGroup,
} from "renderer/react-query/tabs";
import { TabContextMenu } from "./TabContextMenu";
import type { TabItemProps } from "./types";
import { useDragTab } from "./useDragTab";
import { useTabRename } from "./useTabRename";

export function TabItem({ tab, childTabs = [] }: TabItemProps) {
	const [isExpanded, setIsExpanded] = useState(true);
	const { data: activeWorkspace } = trpc.workspaces.getActive.useQuery();
	const { data: allTabs = [] } = trpc.tabs.getByWorkspace.useQuery(
		{ workspaceId: activeWorkspace?.id! },
		{ enabled: !!activeWorkspace?.id },
	);
	const removeTabMutation = useRemoveTab();
	const setActiveTabMutation = useSetActiveTab();
	const ungroupMutation = useUngroup();
	const moveOutOfGroupMutation = useMoveOutOfGroup();

	const isActive = tab.id === activeWorkspace?.activeTabId;

	const { drag, drop, isDragging, isDragOver } = useDragTab(tab.id);

	const rename = useTabRename(tab.id, tab.title);

	const handleRemoveTab = (e?: React.MouseEvent) => {
		e?.stopPropagation();
		removeTabMutation.mutate({ id: tab.id });
	};

	const handleTabClick = () => {
		if (rename.isRenaming) return;
		setActiveTabMutation.mutate({ tabId: tab.id });
	};

	const handleToggleExpand = (e: React.MouseEvent) => {
		e.stopPropagation();
		e.preventDefault();
		if (rename.isRenaming) return;
		setIsExpanded(!isExpanded);
	};

	const handleUngroup = () => {
		ungroupMutation.mutate({ groupId: tab.id });
	};

	const handleMoveOutOfGroup = () => {
		if (!tab.parentId) return;

		// Find the parent group's index in the workspace tabs
		const workspaceTabs = allTabs.filter(
			(t) => t.workspaceId === tab.workspaceId && !t.parentId,
		);
		const parentIndex = workspaceTabs.findIndex((t) => t.id === tab.parentId);

		// Place after the parent (parentIndex + 1)
		if (parentIndex !== -1) {
			moveOutOfGroupMutation.mutate({
				tabId: tab.id,
				targetIndex: parentIndex + 1,
			});
		}
	};

	const attachRef = (el: HTMLButtonElement | null) => {
		drag(el);
		drop(el);
	};

	const isGroupTab = tab.type === "group";
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
							<>
								<span className="truncate flex-1">{tab.title}</span>
								{tab.needsAttention && (
									<span
										className="relative flex size-2 shrink-0 ml-1"
										title="Agent completed"
									>
										<span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
										<span className="relative inline-flex size-2 rounded-full bg-red-500" />
									</span>
								)}
							</>
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
				<div className="ml-4 mt-1 space-y-1 relative">
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
