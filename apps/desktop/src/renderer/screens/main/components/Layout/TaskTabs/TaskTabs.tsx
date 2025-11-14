import { Button } from "@superset/ui/button";
import type React from "react";
import { useEffect, useRef, useState } from "react";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "renderer/components/ui/dialog";
import { AddTaskButton } from "./AddTaskButton";
import { ModeToggle } from "./ModeToggle";
import { PRActions } from "./PRActions";
import { SidebarToggle } from "./SidebarToggle";
import type { TaskTabsProps } from "./types";
import { WorktreeTab } from "./WorktreeTab";

const TAB_GAP = 4; // gap-1 = 4px
const MIN_TAB_WIDTH = 40;
const MAX_TAB_WIDTH = 240;
const WIDTH_BUFFER = 4; // Buffer to account for rounding and measurement discrepancies
const ADD_BUTTON_WIDTH = 32; // Approximate width of AddTaskButton

// Custom hook for calculating tab widths based on available space
function useTabWidth(worktrees: Array<{ id: string }>) {
	const containerRef = useRef<HTMLDivElement>(null);
	const [tabWidth, setTabWidth] = useState<number | undefined>(undefined);

	useEffect(() => {
		if (!containerRef.current || worktrees.length === 0) {
			setTabWidth(undefined);
			return;
		}

		const updateTabWidth = () => {
			if (!containerRef.current || worktrees.length === 0) {
				setTabWidth(undefined);
				return;
			}

			const container = containerRef.current;
			const numTabs = worktrees.length;
			const containerWidth = container.offsetWidth;

			// Account for AddTaskButton width + gap, and gaps between tabs
			// numTabs gaps: (numTabs - 1) between tabs + 1 before button
			const addButtonWidth = ADD_BUTTON_WIDTH + TAB_GAP;
			const totalGapWidth = TAB_GAP * numTabs;
			const availableWidth = containerWidth - totalGapWidth - addButtonWidth - WIDTH_BUFFER;
			const calculatedWidth = availableWidth / numTabs;

			const finalWidth = calculatedWidth < MIN_TAB_WIDTH
				? MIN_TAB_WIDTH
				: Math.floor(Math.max(MIN_TAB_WIDTH, Math.min(MAX_TAB_WIDTH, calculatedWidth)));

			setTabWidth(finalWidth);
		};

		updateTabWidth();

		const resizeObserver = new ResizeObserver(updateTabWidth);
		resizeObserver.observe(containerRef.current);

		return () => {
			resizeObserver.disconnect();
		};
	}, [worktrees.length]);

	return { containerRef, tabWidth };
}

export const TaskTabs: React.FC<TaskTabsProps> = ({
	onCollapseSidebar,
	onExpandSidebar,
	isSidebarOpen,
	onAddTask,
	onCreatePR,
	onMergePR,
	worktrees,
	selectedWorktreeId,
	onWorktreeSelect,
	onDeleteWorktree,
	workspaceId,
	mode = "edit",
	onModeChange,
}) => {
	const [showRemoveDialog, setShowRemoveDialog] = useState(false);
	const [removeWarning, setRemoveWarning] = useState("");
	const [worktreeToDelete, setWorktreeToDelete] = useState<string | null>(null);
	const { containerRef: tabsContainerRef, tabWidth } = useTabWidth(worktrees);

	const selectedWorktree = worktrees.find((wt) => wt.id === selectedWorktreeId);
	const canCreatePR = selectedWorktree && !selectedWorktree.isPending;
	const hasPR = selectedWorktree?.prUrl;

	const handleCloseClick = async (e: React.MouseEvent, worktreeId: string) => {
		e.stopPropagation();

		if (!onDeleteWorktree || !workspaceId) return;

		const worktree = worktrees.find((wt) => wt.id === worktreeId);
		if (!worktree || worktree.isPending) return;

		try {
			const canRemoveResult = await window.ipcRenderer.invoke(
				"worktree-can-remove",
				{ workspaceId, worktreeId },
			);

			const warning = canRemoveResult.hasUncommittedChanges
				? `Warning: This worktree (${worktree.branch}) has uncommitted changes. Removing it will delete these changes permanently.`
				: "";

			setRemoveWarning(warning);
			setWorktreeToDelete(worktreeId);
			setShowRemoveDialog(true);
		} catch (error) {
			console.error("Error checking if worktree can be removed:", error);
			setRemoveWarning("");
			setWorktreeToDelete(worktreeId);
			setShowRemoveDialog(true);
		}
	};

	const handleConfirmRemove = async () => {
		if (!onDeleteWorktree || !worktreeToDelete) return;

		const worktreeId = worktreeToDelete;
		setShowRemoveDialog(false);
		setRemoveWarning("");
		setWorktreeToDelete(null);

		await onDeleteWorktree(worktreeId);
	};

	const handleCancelRemove = () => {
		setShowRemoveDialog(false);
		setRemoveWarning("");
		setWorktreeToDelete(null);
	};

	return (
		<>
			<div
				className="flex items-end justify-between select-none shrink-0 h-10 pl-16 relative overflow-visible"
				style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
			>
				{/* Bottom border line */}
				<div className="absolute bottom-0 left-0 right-0 h-px bg-neutral-800" />
				<div
					className="flex items-center gap-1 px-1 h-full flex-1 min-w-0"
					style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
				>
					<SidebarToggle
						isOpen={isSidebarOpen}
						onCollapse={onCollapseSidebar}
						onExpand={onExpandSidebar}
					/>

					{onModeChange && <ModeToggle mode={mode} onChange={onModeChange} />}

					<div
						ref={tabsContainerRef}
						className="flex items-end h-full gap-1 flex-1 overflow-x-auto overflow-y-hidden relative hide-scrollbar"
					>
						{worktrees.map((worktree, index) => {
							const isSelected = selectedWorktreeId === worktree.id;
							const prevWorktree = index > 0 ? worktrees[index - 1] : null;
							const prevIsSelected = prevWorktree?.id === selectedWorktreeId;
							const showDivider =
								prevWorktree !== null && !isSelected && !prevIsSelected;

							return (
								<div key={worktree.id} className="flex items-end">
									{showDivider && (
										<div className="w-px h-5 bg-neutral-700 self-end mb-1" />
									)}
									<WorktreeTab
										worktree={worktree}
										isSelected={isSelected}
										onSelect={() => onWorktreeSelect(worktree.id)}
										onClose={
											onDeleteWorktree
												? (e) => handleCloseClick(e, worktree.id)
												: undefined
										}
										width={tabWidth}
									/>
								</div>
							);
						})}
						<div className="shrink-0">
							<AddTaskButton onClick={onAddTask} />
						</div>
					</div>
				</div>

				<div
					className="flex items-center gap-2 px-4 h-full"
					style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
				>
					<PRActions
						hasPR={!!hasPR}
						canCreatePR={!!canCreatePR}
						selectedBranch={selectedWorktree?.branch}
						onCreatePR={onCreatePR}
						onMergePR={onMergePR}
					/>
				</div>
			</div>

			{/* Remove Worktree Confirmation Dialog */}
			<Dialog open={showRemoveDialog} onOpenChange={setShowRemoveDialog}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Remove Worktree</DialogTitle>
						<DialogDescription>
							{worktreeToDelete && (
								<>
									Are you sure you want to remove the worktree "
									{worktrees.find((wt) => wt.id === worktreeToDelete)?.branch ??
										worktreeToDelete}
									"? This action cannot be undone.
								</>
							)}
						</DialogDescription>
					</DialogHeader>

					{/* Warning Message */}
					{removeWarning && (
						<div className="p-3 bg-yellow-500/10 border border-yellow-500/30 rounded text-yellow-200 text-sm">
							{removeWarning}
						</div>
					)}

					<DialogFooter>
						<Button variant="ghost" onClick={handleCancelRemove}>
							Cancel
						</Button>
						<Button variant="destructive" onClick={handleConfirmRemove}>
							Remove
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</>
	);
};
