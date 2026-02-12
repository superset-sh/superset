/**
 * Workspace name sanitization for protocol scheme generation.
 *
 * Protocol schemes must be short enough for macOS Launch Services to handle
 * reliably. Long branch names (e.g. "setup-script-should-also-get-paths")
 * are truncated with a hash suffix for uniqueness.
 *
 * Used by both env.shared.ts and worktree-id.ts (which can't import env.shared.ts).
 */

const MAX_LENGTH = 12;

function djb2Hash(str: string): string {
	let hash = 5381;
	for (let i = 0; i < str.length; i++) {
		hash = ((hash << 5) + hash + str.charCodeAt(i)) & 0xffffffff;
	}
	return Math.abs(hash).toString(36).slice(0, 6);
}

export function sanitizeWorkspaceName(name: string): string {
	const sanitized = name.toLowerCase().replace(/[^a-z0-9-]/g, "-");
	if (sanitized.length <= MAX_LENGTH) return sanitized;
	return `${sanitized.slice(0, 8)}-${djb2Hash(sanitized)}`;
}
