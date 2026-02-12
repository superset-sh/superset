/**
 * Standalone workspace name reader for use by predev scripts
 * that cannot import env.shared.ts (Zod validation fails before env is loaded).
 *
 * In-app code should use getWorkspaceName() from env.shared.ts instead.
 */
import { sanitizeWorkspaceName } from "./workspace-hash";

export function getWorkspaceName(): string | undefined {
	const name = process.env.SUPERSET_WORKSPACE_NAME;
	if (!name) return undefined;
	return sanitizeWorkspaceName(name);
}
