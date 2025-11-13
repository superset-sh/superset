import type React from "react";
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
	mode = "edit",
	onModeChange,
}) => {
	const selectedWorktree = worktrees.find((wt) => wt.id === selectedWorktreeId);
	const canCreatePR = selectedWorktree && !selectedWorktree.isPending;
	const hasPR = selectedWorktree?.prUrl;

	return (
		<div
			className="flex items-end justify-between select-none shrink-0 h-10 pl-16 border-b border-neutral-800"
			style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
		>
			<div
				className="flex items-center gap-1 px-1 h-full"
				style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
			>
				<SidebarToggle
					isOpen={isSidebarOpen}
					onCollapse={onCollapseSidebar}
					onExpand={onExpandSidebar}
				/>

				{onModeChange && <ModeToggle mode={mode} onChange={onModeChange} />}

				<div className="flex items-end h-full gap-1">
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
								/>
							</div>
						);
					})}
				</div>

				<AddTaskButton onClick={onAddTask} />
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
	);
};
