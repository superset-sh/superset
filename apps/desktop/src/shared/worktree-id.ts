/**
 * Standalone workspace name reader for use by predev scripts
 * that cannot import env.shared.ts (Zod validation fails before env is loaded).
 *
 * In-app code should use getWorkspaceName() from env.shared.ts instead.
 */
export function normalizeWorkspaceName(name?: string): string | undefined {
	if (!name || name === "superset") return undefined;
	return name
		.toLowerCase()
		.replace(/[^a-z0-9-]/g, "-")
		.slice(0, 32);
}

/**
 * Derive a workspace name from worktree path segments relative to:
 * ~/.superset/worktrees/<project>/...
 *
 * Examples:
 * - ["superset", "my-branch", "apps", "desktop"] -> "my-branch"
 * - ["superset", "owner", "workspace", "apps", "desktop"] -> "owner-workspace"
 * - ["superset", "owner", "feature", "x", "apps", "desktop"] -> "owner-feature-x"
 */
export function deriveWorkspaceNameFromWorktreeSegments(
	segments: string[],
): string | undefined {
	if (segments.length < 2) return undefined;

	const appsIndex = segments.lastIndexOf("apps");
	if (appsIndex === 1 && segments[appsIndex + 1] === "desktop") {
		return undefined;
	}

	const endIndex =
		appsIndex > 1 && segments[appsIndex + 1] === "desktop"
			? appsIndex
			: segments.length;

	const workspaceSegments = segments.slice(1, endIndex);
	if (workspaceSegments.length === 0) return undefined;

	return normalizeWorkspaceName(workspaceSegments.join("-"));
}

export function getWorkspaceName(): string | undefined {
	return normalizeWorkspaceName(process.env.SUPERSET_WORKSPACE_NAME);
}
