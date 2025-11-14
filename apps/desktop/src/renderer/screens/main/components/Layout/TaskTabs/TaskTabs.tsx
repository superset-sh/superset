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
	const tabsContainerRef = useRef<HTMLDivElement>(null);
	const [tabWidth, setTabWidth] = useState<number | undefined>(undefined);

	// Calculate tab width based on available space and number of tabs
	useEffect(() => {
		const updateTabWidth = () => {
			if (!tabsContainerRef.current || worktrees.length === 0) {
				setTabWidth(undefined);
				return;
			}

			const container = tabsContainerRef.current;
			const containerWidth = container.offsetWidth;
			const gap = 4; // gap-1 = 4px
			const numTabs = worktrees.length;

			// Calculate available width per tab (accounting for gaps)
			const availableWidth = containerWidth - (gap * (numTabs - 1));
			const calculatedWidth = availableWidth / numTabs;

			// Apply min/max constraints (Chrome-like: min ~60px, max ~240px)
			const MIN_WIDTH = 60;
			const MAX_WIDTH = 240;
			const constrainedWidth = Math.max(
				MIN_WIDTH,
				Math.min(MAX_WIDTH, calculatedWidth),
			);

			setTabWidth(constrainedWidth);
		};

		updateTabWidth();

		// Update on window resize
		const resizeObserver = new ResizeObserver(updateTabWidth);
		if (tabsContainerRef.current) {
			resizeObserver.observe(tabsContainerRef.current);
		}

		return () => {
			resizeObserver.disconnect();
		};
	}, [worktrees.length]);

	const selectedWorktree = worktrees.find((wt) => wt.id === selectedWorktreeId);
	const canCreatePR = selectedWorktree && !selectedWorktree.isPending;
	const hasPR = selectedWorktree?.prUrl;

	const handleCloseClick = async (e: React.MouseEvent, worktreeId: string) => {
		e.stopPropagation();

		if (!onDeleteWorktree || !workspaceId) return;

		const worktree = worktrees.find((wt) => wt.id === worktreeId);
		// Allow deletion of active/selected worktrees (same as sidebar behavior)
		// Only prevent deletion of pending worktrees
		if (!worktree || worktree.isPending) return;

		// Check if the worktree has uncommitted changes
		try {
			const canRemoveResult = await window.ipcRenderer.invoke(
				"worktree-can-remove",
				{
					workspaceId,
					worktreeId,
				},
			);

			// Build warning message if there are uncommitted changes
			let warning = "";
			if (canRemoveResult.hasUncommittedChanges) {
				warning = `Warning: This worktree (${worktree.branch}) has uncommitted changes. Removing it will delete these changes permanently.`;
			}

			setRemoveWarning(warning);
			setWorktreeToDelete(worktreeId);
			setShowRemoveDialog(true);
		} catch (error) {
			console.error("Error checking if worktree can be removed:", error);
			// Still show dialog even if check fails
			setRemoveWarning("");
			setWorktreeToDelete(worktreeId);
			setShowRemoveDialog(true);
		}
	};

	const confirmRemoveWorktree = async () => {
		if (!onDeleteWorktree || !worktreeToDelete) return;

		setShowRemoveDialog(false);
		setRemoveWarning("");
		const worktreeId = worktreeToDelete;
		setWorktreeToDelete(null);

		await onDeleteWorktree(worktreeId);
	};

	return (
		<>
			<div
				className="flex items-end justify-between select-none shrink-0 h-10 pl-16 border-b border-neutral-800 relative overflow-visible"
				style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
			>
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
						className="flex items-end h-full gap-1 flex-1 min-w-0 overflow-visible relative"
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
						<AddTaskButton onClick={onAddTask} />
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
									{worktrees.find((wt) => wt.id === worktreeToDelete)?.branch ||
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
						<Button
							variant="ghost"
							onClick={() => {
								setShowRemoveDialog(false);
								setRemoveWarning("");
								setWorktreeToDelete(null);
							}}
						>
							Cancel
						</Button>
						<Button variant="destructive" onClick={confirmRemoveWorktree}>
							Remove
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</>
	);
};
