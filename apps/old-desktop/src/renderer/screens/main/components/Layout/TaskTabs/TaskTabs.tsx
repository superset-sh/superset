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
const WIDTH_BUFFER = 2; // Buffer to account for rounding and measurement discrepancies

// Custom hook for calculating tab widths based on available space
function useTabWidth(
	worktrees: Array<{ id: string }>,
	leftControlsRef: React.RefObject<HTMLDivElement | null>,
	rightActionsRef: React.RefObject<HTMLDivElement | null>,
) {
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

			const tabsContainer = containerRef.current;
			const numTabs = worktrees.length;

			// Get the parent container (middle section) which has flex-1
			const middleSection = tabsContainer.parentElement;
			if (!middleSection) {
				setTabWidth(undefined);
				return;
			}

			// Measure fixed elements dynamically
			const leftControlsWidth = leftControlsRef.current?.offsetWidth ?? 0;

			// Account for padding on the middle section (px-1 = 8px total)
			const middleSectionPadding = 8;

			// Get the actual width of the middle section
			const middleSectionWidth = middleSection.offsetWidth;

			// Calculate gaps: (numTabs - 1) between tabs + 1 before AddTaskButton
			const totalGapWidth = TAB_GAP * numTabs;

			// Measure AddTaskButton dynamically
			const addButtonElement = tabsContainer.querySelector("[data-add-button]");
			const addButtonWidth = addButtonElement
				? (addButtonElement as HTMLElement).offsetWidth + TAB_GAP
				: 36; // Fallback estimate (32px button + 4px gap)

			// Calculate available width for tabs
			// Start with middle section width, subtract: left controls, padding, gaps, AddButton, and buffer
			const availableWidth =
				middleSectionWidth -
				leftControlsWidth -
				middleSectionPadding -
				totalGapWidth -
				addButtonWidth -
				WIDTH_BUFFER;

			const widthForTabs = availableWidth;
			const calculatedWidth = widthForTabs / numTabs;

			const finalWidth =
				calculatedWidth < MIN_TAB_WIDTH
					? MIN_TAB_WIDTH
					: Math.floor(
							Math.max(MIN_TAB_WIDTH, Math.min(MAX_TAB_WIDTH, calculatedWidth)),
						);

			setTabWidth(finalWidth);
		};

		// Use requestAnimationFrame to ensure DOM is ready
		const rafId = requestAnimationFrame(() => {
			updateTabWidth();
		});

		const resizeObserver = new ResizeObserver(() => {
			updateTabWidth();
		});

		// Observe the tabs container and its parent (middle section)
		resizeObserver.observe(containerRef.current);
		const middleSection = containerRef.current.parentElement;
		if (middleSection) {
			resizeObserver.observe(middleSection);
		}
		if (leftControlsRef.current) {
			resizeObserver.observe(leftControlsRef.current);
		}
		if (rightActionsRef.current) {
			resizeObserver.observe(rightActionsRef.current);
		}

		return () => {
			cancelAnimationFrame(rafId);
			resizeObserver.disconnect();
		};
	}, [worktrees.length, leftControlsRef, rightActionsRef]);

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
	const leftControlsRef = useRef<HTMLDivElement>(null);
	const rightActionsRef = useRef<HTMLDivElement>(null);
	const { containerRef: tabsContainerRef, tabWidth } = useTabWidth(
		worktrees,
		leftControlsRef,
		rightActionsRef,
	);

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
			<div className="flex items-end justify-between select-none shrink-0 h-10 pl-16 pr-4 relative overflow-visible drag">
				{/* Bottom border line */}
				<div className="absolute bottom-0 left-0 right-0 h-px bg-neutral-800" />
				<div className="flex items-center gap-1 px-1 h-full flex-1 min-w-0">
					<div
						ref={leftControlsRef}
						className="flex items-center gap-1 shrink-0 no-drag"
					>
						<SidebarToggle
							isOpen={isSidebarOpen}
							onCollapse={onCollapseSidebar}
							onExpand={onExpandSidebar}
						/>

						{onModeChange && <ModeToggle mode={mode} onChange={onModeChange} />}
					</div>

					<div
						ref={tabsContainerRef}
						className="flex items-end h-full gap-1 shrink-0 overflow-x-auto overflow-y-hidden relative hide-scrollbar"
					>
						{worktrees.map((worktree, index) => {
							const isSelected = selectedWorktreeId === worktree.id;
							const prevWorktree = index > 0 ? worktrees[index - 1] : null;
							const prevIsSelected = prevWorktree?.id === selectedWorktreeId;
							const showDivider =
								prevWorktree !== null && !isSelected && !prevIsSelected;

							return (
								<div key={worktree.id} className="flex items-end no-drag">
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
					</div>
					<div className="shrink-0 no-drag" data-add-button>
						<AddTaskButton onClick={onAddTask} />
					</div>
				</div>

				<div
					ref={rightActionsRef}
					className="flex items-center gap-2 px-4 h-full shrink-0 no-drag"
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
