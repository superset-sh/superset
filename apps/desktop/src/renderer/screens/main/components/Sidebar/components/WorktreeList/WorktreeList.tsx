import type { Workspace, Worktree } from "shared/types";
import { WorkspacePortIndicator } from "../WorkspacePortIndicator";
import { NewTabButton } from "./components/NewTabButton";
import { WorktreeItem } from "./components/WorktreeItem";

interface WorktreeListProps {
	currentWorkspace: Workspace | null;
	expandedWorktrees: Set<string>;
	onToggleWorktree: (worktreeId: string) => void;
	onTabSelect: (worktreeId: string, tabId: string) => void;
	onReload: () => void;
	onUpdateWorktree: (worktreeId: string, updatedWorktree: Worktree) => void;
	selectedTabId: string | undefined;
	onCloneWorktree: (worktreeId: string, branch: string) => void;
	selectedWorktreeId?: string | null;
	showWorkspaceHeader?: boolean;
}

export function WorktreeList({
	currentWorkspace,
	expandedWorktrees: _expandedWorktrees,
	onToggleWorktree: _onToggleWorktree,
	onTabSelect,
	onReload,
	onUpdateWorktree,
	selectedTabId,
	onCloneWorktree,
	selectedWorktreeId,
	showWorkspaceHeader = false,
}: WorktreeListProps) {

	if (!currentWorkspace) {
		return (
			<div className="text-sm text-gray-500 px-3 py-2">No workspace open</div>
		);
	}

	if (!currentWorkspace.worktrees || currentWorkspace.worktrees.length === 0) {
		return (
			<div className="text-sm text-gray-500 px-3 py-2">
				No worktrees yet. Create one to get started.
			</div>
		);
	}

	// Check if workspace has port forwarding configured
	const hasPortForwarding =
		currentWorkspace.ports && currentWorkspace.ports.length > 0;

	return (
		<>
			{/* Workspace Header - more minimal */}
			{showWorkspaceHeader && currentWorkspace && (
				<div className="px-3 pt-2 pb-1.5">
					<WorkspacePortIndicator workspace={currentWorkspace} />
				</div>
			)}

			{currentWorkspace.worktrees.map((worktree) => (
				<WorktreeItem
					key={worktree.id}
					worktree={worktree}
					workspaceId={currentWorkspace.id}
					activeWorktreeId={currentWorkspace.activeWorktreeId}
					onTabSelect={onTabSelect}
					onReload={onReload}
					onUpdateWorktree={(updatedWorktree) =>
						onUpdateWorktree(worktree.id, updatedWorktree)
					}
					selectedTabId={selectedTabId}
					hasPortForwarding={hasPortForwarding}
					onCloneWorktree={() => onCloneWorktree(worktree.id, worktree.branch)}
				/>
			))}

			{/* Arc-style New Tab Button - styled like a tab at the bottom */}
			{selectedWorktreeId && currentWorkspace && (
				<NewTabButton
					currentWorkspace={currentWorkspace}
					selectedWorktreeId={selectedWorktreeId}
					onTabSelect={onTabSelect}
					onReload={onReload}
				/>
			)}
		</>
	);
}
