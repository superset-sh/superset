import { isAbsolute, relative, resolve } from "node:path";

// Resolved to absolute, then re-based on the workspace root: absolute removes
// the ambiguity of `./index.html`, relative keeps the key portable when a
// worktree moves. Null means publish unlinked.
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

	// Compared for equality, so the separator cannot be platform-dependent.
	return rel.split(/[\\/]/).join("/");
}
