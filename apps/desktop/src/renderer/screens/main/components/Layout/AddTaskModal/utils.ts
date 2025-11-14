import type { APITask, Task } from "./types";

export function formatRelativeTime(date: Date): string {
	const now = new Date();
	const diffMs = now.getTime() - date.getTime();
	const diffMins = Math.floor(diffMs / 60000);
	const diffHours = Math.floor(diffMs / 3600000);
	const diffDays = Math.floor(diffMs / 86400000);

	if (diffMins < 1) return "just now";
	if (diffMins < 60) return `${diffMins} minute${diffMins !== 1 ? "s" : ""} ago`;
	if (diffHours < 24) return `${diffHours} hour${diffHours !== 1 ? "s" : ""} ago`;
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

export function generateBranchNameWithCollisionAvoidance(title: string): string {
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

