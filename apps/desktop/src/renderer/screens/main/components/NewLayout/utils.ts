import type { Worktree } from "shared/types";
import type { PendingWorktree } from "./types";
import { MOCK_TASKS } from "./mock-data";
import type { WorktreeWithTask } from "./TaskTabs";

/**
 * Helper function to enrich worktrees with task metadata
 */
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

