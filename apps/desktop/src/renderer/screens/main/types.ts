import type { TaskStatus } from "./components/Layout/StatusIndicator";

// Type alias for task data used in UI
export type UITask = {
    id: string;
    slug: string;
    name: string;
    status: TaskStatus;
    branch: string;
    description: string;
    assignee: string;
    assigneeAvatarUrl: string;
    lastUpdated: string;
};

// Type for pending worktrees (optimistic updates)
export type PendingWorktree = {
    id: string;
    isPending: true;
    title: string;
    branch: string;
    description?: string;
    taskData?: {
        slug: string;
        name: string;
        status: TaskStatus;
    };
};

export type AppMode = "plan" | "edit";

