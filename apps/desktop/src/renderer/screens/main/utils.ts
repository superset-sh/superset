import type { Tab, Worktree } from "shared/types";
import type { WorktreeWithTask } from "./components/Layout/TaskTabs";
import { MOCK_TASKS } from "./constants";
import type { PendingWorktree } from "./types";

// Helper function to find a tab recursively (for finding sub-tabs inside groups)
export function findTabRecursive(
    tabs: Tab[] | undefined,
    tabId: string,
): { tab: Tab; parent?: Tab } | null {
    if (!tabs) return null;

    for (const tab of tabs) {
        if (tab.id === tabId) {
            return { tab };
        }
        // Check if this tab is a group tab with children
        if (tab.type === "group" && tab.tabs) {
            for (const childTab of tab.tabs) {
                if (childTab.id === tabId) {
                    return { tab: childTab, parent: tab };
                }
            }
        }
    }
    return null;
}

// Helper function to enrich worktrees with task metadata
export function enrichWorktreesWithTasks(
    worktrees: Worktree[],
    pendingWorktrees: PendingWorktree[],
): WorktreeWithTask[] {
    // First, convert pending worktrees to WorktreeWithTask format
    const pendingAsWorktrees: WorktreeWithTask[] = pendingWorktrees.map(
        (pending) => ({
            id: pending.id,
            branch: pending.branch,
            path: "", // Pending worktrees don't have a path yet
            tabs: [],
            createdAt: new Date().toISOString(),
            isPending: true, // Mark as pending for UI
            task: pending.taskData
                ? {
                    id: pending.id,
                    slug: pending.taskData.slug,
                    title: pending.taskData.name,
                    status: pending.taskData.status,
                    description: pending.description || "",
                }
                : undefined,
        }),
    );

    // Then, enrich real worktrees with task metadata
    const enrichedWorktrees = worktrees.map((worktree) => {
        // Try to find a matching task by branch name
        const matchingTask = MOCK_TASKS.find(
            (task) => task.branch === worktree.branch,
        );

        if (matchingTask) {
            // Worktree has an associated task - add task metadata
            return {
                ...worktree,
                task: {
                    id: matchingTask.id,
                    slug: matchingTask.slug,
                    title: matchingTask.name,
                    status: matchingTask.status,
                    description: matchingTask.description,
                    assignee: {
                        name: matchingTask.assignee,
                        avatarUrl: matchingTask.assigneeAvatarUrl,
                    },
                    lastUpdated: matchingTask.lastUpdated,
                },
            };
        }

        // Worktree without task - return as-is
        return worktree;
    });

    // Merge pending and real worktrees
    return [...pendingAsWorktrees, ...enrichedWorktrees];
}
