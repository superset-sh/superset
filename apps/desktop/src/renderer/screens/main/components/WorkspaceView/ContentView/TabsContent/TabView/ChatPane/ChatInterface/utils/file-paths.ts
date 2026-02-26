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
	let normalizedPath = filePath.trim();
	if (!normalizedPath) return null;

	if (normalizedPath.startsWith("file://")) {
		const rawPath = normalizedPath.slice(7);
		try {
			normalizedPath = decodeURIComponent(rawPath);
		} catch {
			normalizedPath = rawPath;
		}
	}

	normalizedPath = normalizedPath.replaceAll("\\", "/");

	const normalizedRoot = workspaceRoot
		? workspaceRoot.replaceAll("\\", "/").replace(/\/+$/, "")
		: "";

	if (normalizedRoot) {
		if (normalizedPath === normalizedRoot) return null;
		if (normalizedPath.startsWith(`${normalizedRoot}/`)) {
			normalizedPath = normalizedPath.slice(normalizedRoot.length + 1);
		}
	}

	while (normalizedPath.startsWith("./")) {
		normalizedPath = normalizedPath.slice(2);
	}

	if (!normalizedPath || normalizedPath === ".") return null;
	if (normalizedPath.startsWith("/")) return null;

	return normalizedPath;
}

function toStringValue(value: unknown): string | null {
	if (typeof value !== "string") return null;
	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : null;
}
