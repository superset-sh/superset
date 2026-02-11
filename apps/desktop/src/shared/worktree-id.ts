/**
 * Standalone workspace name reader for use by predev scripts
 * that cannot import env.shared.ts (Zod validation fails before env is loaded).
 *
 * In-app code should use getWorkspaceName() from env.shared.ts instead.
 */
export function getWorkspaceName(): string | undefined {
	const name = process.env.SUPERSET_WORKSPACE_NAME;
	if (!name) return undefined;
	return name
		.toLowerCase()
		.replace(/[^a-z0-9-]/g, "-")
		.slice(0, 32);
}
