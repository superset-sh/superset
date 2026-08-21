import { isAbsolute, relative, resolve } from "node:path";

/**
 * The republish key for a file, relative to its workspace root.
 *
 * Resolving to absolute first is what removes the ambiguity of `./index.html`
 * meaning two different files from two different directories. Re-basing on the
 * workspace root is what keeps the key portable: an absolute path breaks the
 * moment a worktree is moved or re-cloned, and would put someone's home
 * directory in the database for no benefit.
 *
 * Returns null when there is no workspace, or when the file sits outside it —
 * publishing then creates an unlinked page, which is honest, because a
 * workspace-scoped key would be claiming something untrue.
 */
export function resolveEntryPath({
	filePath,
	workspacePath,
	cwd = process.cwd(),
}: {
	filePath: string;
	workspacePath: string | undefined;
	cwd?: string;
}): string | null {
	if (!workspacePath) return null;

	const absolute = resolve(cwd, filePath);
	const rel = relative(resolve(workspacePath), absolute);
	if (!rel || rel.startsWith("..") || isAbsolute(rel)) return null;

	// Stored keys are compared for equality, so the separator must not depend
	// on which platform published.
	return rel.split(/[\\/]/).join("/");
}
