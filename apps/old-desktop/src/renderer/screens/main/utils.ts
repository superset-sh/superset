import type { Tab, Worktree } from "shared/types";
import { formatRelativeTime } from "./components/Layout/AddTaskModal/utils";
import type { TaskStatus } from "./components/Layout/StatusIndicator";
import type { WorktreeWithTask } from "./components/Layout/TaskTabs";
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

/**
 * Determine task status based on worktree state
 */
function getTaskStatusFromWorktree(worktree: Worktree): TaskStatus {
	if (worktree.merged) {
		return "completed";
	}
	if (worktree.prUrl) {
		return "ready-to-merge";
	}
	if (worktree.tabs && worktree.tabs.length > 0) {
		return "working";
	}
	return "planning";
}

/**
 * Generate slug from branch name
 */
function generateSlugFromBranch(branch: string): string {
	return branch
		.toLowerCase()
		.replace(/[^a-z0-9-]/g, "-")
		.replace(/-+/g, "-")
		.replace(/^-+|-+$/g, "");
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

	// Then, enrich real worktrees with task metadata derived from worktree data
	const enrichedWorktrees: WorktreeWithTask[] = worktrees.map((worktree) => {
		// Generate task metadata from worktree data
		const slug = generateSlugFromBranch(worktree.branch);
		const status = getTaskStatusFromWorktree(worktree);
		const title = worktree.description || worktree.branch;

		return {
			...worktree,
			task: {
				id: worktree.id,
				slug: slug || worktree.id,
				title,
				status,
				description: worktree.description || "",
				lastUpdated: formatRelativeTime(new Date(worktree.createdAt)),
			},
		};
	});

	// Merge pending and real worktrees
	return [...pendingAsWorktrees, ...enrichedWorktrees];
}
