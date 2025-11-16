import type { Worktree } from "shared/types";
import type { TaskStatus } from "../StatusIndicator";
import type { APITask, Task } from "./types";

export function formatRelativeTime(date: Date): string {
	const now = new Date();
	const diffMs = now.getTime() - date.getTime();
	const diffMins = Math.floor(diffMs / 60000);
	const diffHours = Math.floor(diffMs / 3600000);
	const diffDays = Math.floor(diffMs / 86400000);

	if (diffMins < 1) return "just now";
	if (diffMins < 60)
		return `${diffMins} minute${diffMins !== 1 ? "s" : ""} ago`;
	if (diffHours < 24)
		return `${diffHours} hour${diffHours !== 1 ? "s" : ""} ago`;
	if (diffDays < 7) return `${diffDays} day${diffDays !== 1 ? "s" : ""} ago`;
	return date.toLocaleDateString();
}

export function transformAPITaskToUITask(apiTask: APITask): Task {
	return {
		id: apiTask.id,
		slug: apiTask.slug,
		name: apiTask.title,
		status: apiTask.status,
		branch: apiTask.branch || "",
		description: apiTask.description || "",
		assignee: apiTask.assignee?.name || "Unassigned",
		assigneeAvatarUrl: apiTask.assignee?.avatarUrl || "",
		lastUpdated: formatRelativeTime(new Date(apiTask.updatedAt)),
	};
}

/**
 * Transform a Worktree from workspace config to a Task for display
 */
export function transformWorktreeToTask(worktree: Worktree): Task {
	// Generate slug from branch name
	const slug = worktree.branch
		.toLowerCase()
		.replace(/[^a-z0-9-]/g, "-")
		.replace(/-+/g, "-")
		.replace(/^-+|-+$/g, "");

	// Determine status based on worktree state
	let status: TaskStatus = "planning";
	if (worktree.merged) {
		status = "completed";
	} else if (worktree.prUrl) {
		status = "ready-to-merge";
	} else if (worktree.tabs && worktree.tabs.length > 0) {
		status = "working";
	}

	// Use description as name if available, otherwise use branch name
	const name = worktree.description || worktree.branch;

	return {
		id: worktree.id,
		slug: slug || worktree.id,
		name,
		status,
		branch: worktree.branch,
		description: worktree.description || "",
		assignee: "Unassigned",
		assigneeAvatarUrl: "",
		lastUpdated: formatRelativeTime(new Date(worktree.createdAt)),
	};
}

export function generateBranchNameWithCollisionAvoidance(
	title: string,
): string {
	// Convert to lowercase and replace spaces/special chars with hyphens
	let slug = title
		.toLowerCase()
		.trim()
		.replace(/[\s_]+/g, "-")
		.replace(/[^a-z0-9-]/g, "")
		.replace(/-+/g, "-")
		.replace(/^-+|-+$/g, "");

	// If slug is empty after sanitization, use a default
	if (!slug) {
		slug = "worktree";
	}

	// Generate random suffix (4 chars) for collision avoidance
	const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
	let randomSuffix = "";
	for (let i = 0; i < 4; i++) {
		randomSuffix += chars.charAt(Math.floor(Math.random() * chars.length));
	}

	// Calculate available length (max 50 chars, reserve 5 for "-" + suffix)
	const maxLength = 50;
	const availableLength = maxLength - 4 - 1; // 45 chars for base slug

	// Truncate slug if needed
	if (slug.length > availableLength) {
		const truncated = slug.substring(0, availableLength);
		const lastHyphen = truncated.lastIndexOf("-");

		if (lastHyphen > availableLength * 0.7) {
			slug = truncated.substring(0, lastHyphen);
		} else {
			slug = truncated;
		}

		slug = slug.replace(/-+$/, "");
	}

	return `${slug}-${randomSuffix}`;
}
