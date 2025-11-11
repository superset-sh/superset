import type { Worktree } from "shared/types";
import type { TaskStatus } from "../StatusIndicator";

export interface WorktreeWithTask extends Worktree {
	isPending?: boolean;
	task?: {
		id: string;
		slug: string;
		title: string;
		status: TaskStatus;
		description: string;
		assignee?: {
			name: string;
			avatarUrl: string | null;
		};
		lastUpdated?: string;
	};
}

export interface TaskTabsProps {
	onCollapseSidebar: () => void;
	onExpandSidebar: () => void;
	isSidebarOpen: boolean;
	onAddTask: () => void;
	onCreatePR?: () => void;
	onMergePR?: () => void;
	worktrees: WorktreeWithTask[];
	selectedWorktreeId: string | null;
	onWorktreeSelect: (worktreeId: string) => void;
	mode?: "plan" | "edit";
	onModeChange?: (mode: "plan" | "edit") => void;
}
