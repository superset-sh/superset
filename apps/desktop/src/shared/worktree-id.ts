/**
 * Utilities for multi-worktree development instance isolation.
 *
 * When running inside a Superset terminal, SUPERSET_WORKSPACE_NAME and
 * SUPERSET_PORT_BASE are set to enable multiple dev instances to run
 * simultaneously with isolated resources (home dir, ports, app name).
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

/**
 * Get allocated port base for this workspace.
 * Returns the base port from which all workspace ports are calculated.
 */
export function getPortBase(): number {
	const base = process.env.SUPERSET_PORT_BASE;
	if (base) {
		const parsed = Number(base);
		if (!Number.isNaN(parsed) && parsed > 0) {
			return parsed;
		}
	}
	return 3000; // default
}
