import type { Workspace } from "shared/types";
import { WorktreeItem } from "./components/WorktreeItem";

interface WorktreeListProps {
	currentWorkspace: Workspace | null;
	expandedWorktrees: Set<string>;
	onToggleWorktree: (worktreeId: string) => void;
	onTabSelect: (worktreeId: string, tabGroupId: string, tabId: string) => void;
	onTabGroupSelect: (worktreeId: string, tabGroupId: string) => void;
	selectedTabId?: string;
	selectedTabGroupId?: string;
}

export function WorktreeList({
	currentWorkspace,
	expandedWorktrees,
	onToggleWorktree,
	onTabSelect,
	onTabGroupSelect,
	selectedTabId,
	selectedTabGroupId,
}: WorktreeListProps) {
	if (!currentWorkspace) {
		return (
			<div className="text-sm text-gray-500 px-3 py-2">
				No currentWorkspace open
			</div>
		);
	}

	if (!currentWorkspace.worktrees || currentWorkspace.worktrees.length === 0) {
		return (
			<div className="text-sm text-gray-500 px-3 py-2">
				No worktrees yet. Create one to get started.
			</div>
		);
	}

	return (
		<>
			{currentWorkspace.worktrees.map((worktree) => (
				<WorktreeItem
					key={worktree.id}
					worktree={worktree}
					isExpanded={expandedWorktrees.has(worktree.id)}
					onToggle={onToggleWorktree}
					onTabSelect={onTabSelect}
					onTabGroupSelect={onTabGroupSelect}
					selectedTabId={selectedTabId}
					selectedTabGroupId={selectedTabGroupId}
				/>
			))}
		</>
	);
}
