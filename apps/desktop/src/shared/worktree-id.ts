/**
 * Utilities for multi-worktree development instance isolation.
 *
 * When running inside a Superset terminal, SUPERSET_WORKSPACE_NAME is set
 * to enable multiple dev instances to run simultaneously with isolated
 * resources (home dir, ports, app name).
 */

/**
 * Get workspace name for instance isolation.
 * Returns a sanitized name suitable for use in directory names.
 */
export function getWorkspaceName(): string | undefined {
	const name = process.env.SUPERSET_WORKSPACE_NAME;
	if (!name) return undefined;
	// Sanitize for use in directory names
	return name
		.toLowerCase()
		.replace(/[^a-z0-9-]/g, "-")
		.slice(0, 32);
}
