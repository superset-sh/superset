import type { TaskStatus } from "../StatusIndicator";
import type { Worktree } from "shared/types";

export interface Task {
	id: string;
	slug: string;
	name: string;
	status: TaskStatus;
	branch: string;
	description: string;
	assignee: string;
	assigneeAvatarUrl: string;
	lastUpdated: string;
}

export interface APITask {
	id: string;
	slug: string;
	title: string;
	description: string | null;
	status: TaskStatus;
	branch: string | null;
	createdAt: string;
	updatedAt: string;
	assignee: {
		id: string;
		name: string;
		avatarUrl: string | null;
	} | null;
	creator: {
		id: string;
		name: string;
		avatarUrl: string | null;
	};
}

export interface AddTaskModalProps {
	isOpen: boolean;
	onClose: () => void;
	openTasks: Task[];
	onSelectTask: (task: Task) => void;
	onCreateTask: (taskData: {
		name: string;
		description: string;
		status: TaskStatus;
		assignee: string;
		branch: string;
		sourceBranch?: string;
		cloneTabsFromWorktreeId?: string;
	}) => void;
	initialMode?: "list" | "new";
	branches?: string[];
	worktrees?: Worktree[];
	isCreating?: boolean;
	setupStatus?: string;
	setupOutput?: string;
	onClearStatus?: () => void;
	apiBaseUrl?: string;
}

