import { Button } from "@superset/ui/button";
import { ChevronRight, FolderOpen, GitBranch } from "lucide-react";
import { useEffect, useState } from "react";
import type { Tab, TabGroup, Worktree } from "shared/runtime-types";
import {
	DndContext,
	DragEndEvent,
	DragOverEvent,
	DragOverlay,
	DragStartEvent,
	KeyboardSensor,
	PointerSensor,
	closestCenter,
	useSensor,
	useSensors,
} from "@dnd-kit/core";
import {
	SortableContext,
	arrayMove,
	sortableKeyboardCoordinates,
	useSortable,
	verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { TabItem } from "./components/TabItem";

// Non-sortable wrapper for tab groups (only tabs are draggable)
function TabGroupSection({
	tabGroup,
	worktree,
	isExpanded,
	isSelected,
	onToggle,
	selectedTabId,
	onTabSelect,
}: {
	tabGroup: TabGroup;
	worktree: Worktree;
	isExpanded: boolean;
	isSelected: boolean;
	onToggle: () => void;
	selectedTabId?: string;
	onTabSelect: (worktreeId: string, tabGroupId: string, tabId: string) => void;
}) {
	const {
		setNodeRef,
		isOver,
	} = useSortable({
		id: tabGroup.id,
		data: {
			type: "tab-group",
		},
		// Disable dragging for tab groups
		disabled: true,
	});

	return (
		<div
			ref={setNodeRef}
			className={`space-y-1 ${isOver ? "bg-neutral-800/50 rounded" : ""}`}
		>
			{/* Tab Group Header */}
			<Button
				variant="ghost"
				size="sm"
				onClick={onToggle}
				className={`w-full h-8 px-3 font-normal ${
					isSelected ? "bg-neutral-800 border border-neutral-700" : ""
				}`}
				style={{ justifyContent: "flex-start" }}
			>
				<ChevronRight
					size={12}
					className={`transition-transform ${isExpanded ? "rotate-90" : ""}`}
				/>
				<FolderOpen size={14} className="opacity-70" />
				<span className="truncate">{tabGroup.name}</span>
			</Button>

			{/* Tabs List */}
			{isExpanded && (
				<div className="ml-6 space-y-1">
					<SortableContext
						items={tabGroup.tabs.map((t) => t.id)}
						strategy={verticalListSortingStrategy}
					>
						{tabGroup.tabs.map((tab) => (
							<SortableTab
								key={tab.id}
								tab={tab}
								worktreeId={worktree.id}
								tabGroupId={tabGroup.id}
								selectedTabId={selectedTabId}
								onTabSelect={onTabSelect}
							/>
						))}
					</SortableContext>
				</div>
			)}
		</div>
	);
}

// Sortable wrapper for tabs
function SortableTab({
	tab,
	worktreeId,
	tabGroupId,
	selectedTabId,
	onTabSelect,
}: {
	tab: Tab;
	worktreeId: string;
	tabGroupId: string;
	selectedTabId?: string;
	onTabSelect: (worktreeId: string, tabGroupId: string, tabId: string) => void;
}) {
	const {
		attributes,
		listeners,
		setNodeRef,
		transform,
		transition,
		isDragging,
	} = useSortable({
		id: tab.id,
		data: {
			type: "tab",
			tabGroupId,
		},
	});

	const style = {
		transform: CSS.Transform.toString(transform),
		transition,
		opacity: isDragging ? 0.5 : 1,
	};

	return (
		<div ref={setNodeRef} style={style} {...attributes} {...listeners}>
			<TabItem
				tab={tab}
				worktreeId={worktreeId}
				tabGroupId={tabGroupId}
				selectedTabId={selectedTabId}
				onTabSelect={onTabSelect}
			/>
		</div>
	);
}

interface WorktreeItemProps {
	worktree: Worktree;
	workspaceId: string;
	isExpanded: boolean;
	onToggle: (worktreeId: string) => void;
	onTabSelect: (worktreeId: string, tabGroupId: string, tabId: string) => void;
	onTabGroupSelect: (worktreeId: string, tabGroupId: string) => void;
	onReload: () => void;
	onUpdateWorktree: (updatedWorktree: Worktree) => void;
	selectedTabId?: string;
	selectedTabGroupId?: string;
}

export function WorktreeItem({
	worktree,
	workspaceId,
	isExpanded,
	onToggle,
	onTabSelect,
	onTabGroupSelect,
	onReload,
	onUpdateWorktree,
	selectedTabId,
	selectedTabGroupId,
}: WorktreeItemProps) {
	// Track which tab groups are expanded
	const [expandedTabGroups, setExpandedTabGroups] = useState<Set<string>>(
		new Set(),
	);

	// Track active drag state
	const [activeId, setActiveId] = useState<string | null>(null);
	const [overId, setOverId] = useState<string | null>(null);

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

	// Configure sensors for drag-and-drop
	const sensors = useSensors(
		useSensor(PointerSensor, {
			activationConstraint: {
				distance: 8,
			},
		}),
		useSensor(KeyboardSensor, {
			coordinateGetter: sortableKeyboardCoordinates,
		}),
	);

	const handleDragStart = (event: DragStartEvent) => {
		setActiveId(event.active.id as string);
	};

	const handleDragOver = (event: DragOverEvent) => {
		setOverId(event.over?.id as string | null);
	};

	const handleDragEnd = async (event: DragEndEvent) => {
		const { active, over } = event;
		setActiveId(null);
		setOverId(null);

		if (!over || active.id === over.id) {
			return;
		}

		const activeData = active.data.current;
		const overData = over.data.current;

		// Only handle tab dragging (not tab groups)
		if (activeData?.type !== "tab") {
			return;
		}

		try {
			// Handle tab reordering within the same tab group
			if (
				overData?.type === "tab" &&
				activeData.tabGroupId === overData.tabGroupId
			) {
				const tabGroup = worktree.tabGroups.find(
					(tg) => tg.id === activeData.tabGroupId,
				);
				if (!tabGroup) return;

				const oldIndex = tabGroup.tabs.findIndex((t) => t.id === active.id);
				const newIndex = tabGroup.tabs.findIndex((t) => t.id === over.id);

				// Optimistic update: update the local state immediately
				const reorderedTabs = arrayMove(tabGroup.tabs, oldIndex, newIndex);

				// Recalculate grid positions based on new array order
				const tabsWithUpdatedPositions = reorderedTabs.map((tab, index) => {
					const row = Math.floor(index / tabGroup.cols);
					const col = index % tabGroup.cols;
					return { ...tab, row, col };
				});

				const updatedTabGroup = { ...tabGroup, tabs: tabsWithUpdatedPositions };
				const updatedTabGroups = worktree.tabGroups.map((tg) =>
					tg.id === activeData.tabGroupId ? updatedTabGroup : tg,
				);
				const updatedWorktree = { ...worktree, tabGroups: updatedTabGroups };
				onUpdateWorktree(updatedWorktree);

				// Save to backend
				const newOrder = reorderedTabs.map((t) => t.id);
				const result = await window.ipcRenderer.invoke("tab-reorder", {
					workspaceId,
					worktreeId: worktree.id,
					tabGroupId: activeData.tabGroupId,
					tabIds: newOrder,
				});

				if (!result.success) {
					console.error("Failed to reorder tabs:", result.error);
					// Revert on failure
					onReload();
				}
			}
			// Handle moving tab to a different tab group
			else if (
				overData?.type === "tab-group" &&
				activeData.tabGroupId !== over.id
			) {
				// Moving to a different tab group
				const sourceTabGroup = worktree.tabGroups.find(
					(tg) => tg.id === activeData.tabGroupId,
				);
				const targetTabGroup = worktree.tabGroups.find(
					(tg) => tg.id === over.id,
				);
				if (!sourceTabGroup || !targetTabGroup) return;

				const tabToMove = sourceTabGroup.tabs.find((t) => t.id === active.id);
				if (!tabToMove) return;

				// Optimistic update
				const updatedSourceTabs = sourceTabGroup.tabs
					.filter((t) => t.id !== active.id)
					.map((tab, index) => {
						const row = Math.floor(index / sourceTabGroup.cols);
						const col = index % sourceTabGroup.cols;
						return { ...tab, row, col };
					});

				const updatedTargetTabs = [...targetTabGroup.tabs, tabToMove].map(
					(tab, index) => {
						const row = Math.floor(index / targetTabGroup.cols);
						const col = index % targetTabGroup.cols;
						return { ...tab, row, col };
					},
				);

				const updatedTabGroups = worktree.tabGroups.map((tg) => {
					if (tg.id === activeData.tabGroupId) {
						return { ...tg, tabs: updatedSourceTabs };
					}
					if (tg.id === over.id) {
						return { ...tg, tabs: updatedTargetTabs };
					}
					return tg;
				});

				const updatedWorktree = { ...worktree, tabGroups: updatedTabGroups };
				onUpdateWorktree(updatedWorktree);

				// Save to backend
				const result = await window.ipcRenderer.invoke("tab-move-to-group", {
					workspaceId,
					worktreeId: worktree.id,
					tabId: active.id as string,
					sourceTabGroupId: activeData.tabGroupId,
					targetTabGroupId: over.id as string,
					targetIndex: targetTabGroup.tabs.length,
				});

				if (!result.success) {
					console.error("Failed to move tab:", result.error);
					onReload();
				}
			}
			// Handle moving tab between tabs in different groups
			else if (
				overData?.type === "tab" &&
				activeData.tabGroupId !== overData.tabGroupId
			) {
				const sourceTabGroup = worktree.tabGroups.find(
					(tg) => tg.id === activeData.tabGroupId,
				);
				const targetTabGroup = worktree.tabGroups.find(
					(tg) => tg.id === overData.tabGroupId,
				);
				if (!sourceTabGroup || !targetTabGroup) return;

				const tabToMove = sourceTabGroup.tabs.find((t) => t.id === active.id);
				if (!tabToMove) return;

				const targetIndex = targetTabGroup.tabs.findIndex(
					(t) => t.id === over.id,
				);

				// Optimistic update
				const updatedSourceTabs = sourceTabGroup.tabs
					.filter((t) => t.id !== active.id)
					.map((tab, index) => {
						const row = Math.floor(index / sourceTabGroup.cols);
						const col = index % sourceTabGroup.cols;
						return { ...tab, row, col };
					});

				const updatedTargetTabsTemp = [...targetTabGroup.tabs];
				updatedTargetTabsTemp.splice(targetIndex, 0, tabToMove);
				const updatedTargetTabs = updatedTargetTabsTemp.map((tab, index) => {
					const row = Math.floor(index / targetTabGroup.cols);
					const col = index % targetTabGroup.cols;
					return { ...tab, row, col };
				});

				const updatedTabGroups = worktree.tabGroups.map((tg) => {
					if (tg.id === activeData.tabGroupId) {
						return { ...tg, tabs: updatedSourceTabs };
					}
					if (tg.id === overData.tabGroupId) {
						return { ...tg, tabs: updatedTargetTabs };
					}
					return tg;
				});

				const updatedWorktree = { ...worktree, tabGroups: updatedTabGroups };
				onUpdateWorktree(updatedWorktree);

				// Save to backend
				const result = await window.ipcRenderer.invoke("tab-move-to-group", {
					workspaceId,
					worktreeId: worktree.id,
					tabId: active.id as string,
					sourceTabGroupId: activeData.tabGroupId,
					targetTabGroupId: overData.tabGroupId,
					targetIndex,
				});

				if (!result.success) {
					console.error("Failed to move tab:", result.error);
					onReload();
				}
			}
		} catch (error) {
			console.error("Error during drag end:", error);
		}
	};

	// Get active item for drag overlay
	const activeItem = activeId
		? worktree.tabGroups
				.flatMap((tg) => tg.tabs)
				.find((t) => t.id === activeId) ||
			worktree.tabGroups.find((tg) => tg.id === activeId)
		: null;

	return (
		<DndContext
			sensors={sensors}
			collisionDetection={closestCenter}
			onDragStart={handleDragStart}
			onDragOver={handleDragOver}
			onDragEnd={handleDragEnd}
		>
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
							<TabGroupSection
								key={tabGroup.id}
								tabGroup={tabGroup}
								worktree={worktree}
								isExpanded={expandedTabGroups.has(tabGroup.id)}
								isSelected={selectedTabGroupId === tabGroup.id && !selectedTabId}
								onToggle={() => {
									onTabGroupSelect(worktree.id, tabGroup.id);
									toggleTabGroup(tabGroup.id);
								}}
								selectedTabId={selectedTabId}
								onTabSelect={onTabSelect}
							/>
						))}
					</div>
				)}
			</div>

			<DragOverlay>
				{activeItem ? (
					<div className="bg-neutral-800 border border-neutral-700 rounded px-3 py-2 text-sm opacity-90">
						{"name" in activeItem ? activeItem.name : "Tab Group"}
					</div>
				) : null}
			</DragOverlay>
		</DndContext>
	);
}
