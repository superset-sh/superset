import { isAbsolute, normalize, relative, resolve } from "pathe";

export function getWorkspaceToolFilePath({
	toolName,
	args,
}: {
	toolName: string;
	args: Record<string, unknown>;
}): string | null {
	switch (toolName) {
		case "mastra_workspace_read_file":
		case "mastra_workspace_write_file":
		case "mastra_workspace_edit_file":
		case "mastra_workspace_file_stat":
		case "mastra_workspace_delete":
			return toStringValue(
				args.path ?? args.filePath ?? args.file_path ?? args.file,
			);
		default:
			return null;
	}
}

export function normalizeWorkspaceFilePath({
	filePath,
	workspaceRoot,
}: {
	filePath: string;
	workspaceRoot?: string;
}): string | null {
	let normalizedPath = stripFileUri(filePath.trim());
	if (!normalizedPath) return null;

	normalizedPath = normalize(normalizedPath);

	if (workspaceRoot) {
		const root = normalize(workspaceRoot);
		if (normalizedPath === root) return null;
		if (isAbsolute(normalizedPath)) {
			const rel = relative(root, normalizedPath);
			// relative() returns a path starting with ".." if outside the root
			if (rel.startsWith("..")) return null;
			normalizedPath = rel;
		}
	}

	if (!normalizedPath || normalizedPath === ".") return null;
	if (isAbsolute(normalizedPath)) return null;

	return normalizedPath;
}

/**
 * Resolves a file path to an absolute path given a workspace root.
 * Handles file:// URIs, relative paths, and already-absolute paths.
 * Returns null if the path is empty or resolves to the workspace root itself.
 */
export function resolveToAbsolutePath({
	filePath,
	workspaceRoot,
}: {
	filePath: string;
	workspaceRoot?: string;
}): string | null {
	const normalizedPath = stripFileUri(filePath.trim());
	if (!normalizedPath) return null;

	// Remote URL — pass through
	if (
		normalizedPath.startsWith("https://") ||
		normalizedPath.startsWith("http://")
	) {
		return normalizedPath;
	}

	// Already absolute — normalize and return
	if (isAbsolute(normalizedPath)) {
		return normalize(normalizedPath);
	}

	// Relative path — resolve against workspace root
	if (!workspaceRoot) return null;

	const resolved = resolve(workspaceRoot, normalizedPath);
	// Don't return the workspace root itself
	if (resolved === normalize(workspaceRoot)) return null;

	return resolved;
}

function stripFileUri(path: string): string {
	if (!path.startsWith("file://")) return path;
	const rawPath = path.slice(7);
	try {
		return decodeURIComponent(rawPath);
	} catch {
		return rawPath;
	}
}

function toStringValue(value: unknown): string | null {
	if (typeof value !== "string") return null;
	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : null;
}
