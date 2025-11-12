import type { Workspace } from "shared/types";
import { Sidebar } from "../Sidebar";

interface SidebarOverlayProps {
	isVisible: boolean;
	workspaces: Workspace[] | null;
	currentWorkspace: Workspace | null;
	onMouseLeave: () => void;
	onTabSelect: (worktreeId: string, tabId: string) => void;
	onWorktreeCreated: () => Promise<void>;
	onWorkspaceSelect: (workspaceId: string) => Promise<void>;
	onUpdateWorktree: (worktreeId: string, updatedWorktree: import("shared/types").Worktree) => void;
	selectedTabId?: string;
	selectedWorktreeId: string | null;
	onShowDiff: (worktreeId: string) => Promise<void>;
}

export function SidebarOverlay({
	isVisible,
	workspaces,
	currentWorkspace,
	onMouseLeave,
	onTabSelect,
	onWorktreeCreated,
	onWorkspaceSelect,
	onUpdateWorktree,
	selectedTabId,
	selectedWorktreeId,
	onShowDiff,
}: SidebarOverlayProps) {
	if (!isVisible || !workspaces) return null;

	return (
		<aside
			className="fixed left-0 top-0 bottom-0 w-80 z-40 animate-in slide-in-from-left duration-200"
			onMouseLeave={onMouseLeave}
		>
			<div className="h-full border-r border-neutral-800 bg-neutral-950/95 backdrop-blur-sm">
				<Sidebar
					workspaces={workspaces}
					currentWorkspace={currentWorkspace}
					onTabSelect={onTabSelect}
					onWorktreeCreated={onWorktreeCreated}
					onWorkspaceSelect={onWorkspaceSelect}
					onUpdateWorktree={onUpdateWorktree}
					selectedTabId={selectedTabId}
					selectedWorktreeId={selectedWorktreeId}
					onCollapse={onMouseLeave}
					onShowDiff={onShowDiff}
				/>
			</div>
		</aside>
	);
}

