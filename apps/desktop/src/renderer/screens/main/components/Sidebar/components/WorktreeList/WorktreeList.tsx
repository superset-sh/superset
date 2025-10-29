import type { Worktree, Workspace } from "shared/runtime-types";
import { WorktreeItem } from "./components/WorktreeItem";

interface WorktreeListProps {
	currentWorkspace: Workspace | null;
	expandedWorktrees: Set<string>;
	onToggleWorktree: (worktreeId: string) => void;
	onTabSelect: (worktreeId: string, tabGroupId: string, tabId: string) => void;
	onTabGroupSelect: (worktreeId: string, tabGroupId: string) => void;
	onReload: () => void;
	onUpdateWorktree: (worktreeId: string, updatedWorktree: Worktree) => void;
	selectedTabId?: string;
	selectedTabGroupId?: string;
}

export function WorktreeList({
	currentWorkspace,
	expandedWorktrees,
	onToggleWorktree,
	onTabSelect,
	onTabGroupSelect,
	onReload,
	onUpdateWorktree,
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
					workspaceId={currentWorkspace.id}
					isExpanded={expandedWorktrees.has(worktree.id)}
					onToggle={onToggleWorktree}
					onTabSelect={onTabSelect}
					onTabGroupSelect={onTabGroupSelect}
					onReload={onReload}
					onUpdateWorktree={(updatedWorktree) =>
						onUpdateWorktree(worktree.id, updatedWorktree)
					}
					selectedTabId={selectedTabId}
					selectedTabGroupId={selectedTabGroupId}
				/>
			))}
		</>
	);
}
