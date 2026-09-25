const WINDOWS_DRIVE_PREFIX = /^([A-Z]):/;

function isRemotePath(path: string): boolean {
	return path.startsWith("https://") || path.startsWith("http://");
}

export function isAbsoluteFilesystemPath(path: string): boolean {
	return (
		path.startsWith("/") ||
		path.startsWith("\\\\") ||
		/^[A-Za-z]:[\\/]/.test(path)
	);
}

export function toAbsoluteWorkspacePath(
	worktreePath: string,
	filePath: string,
): string {
	if (
		!filePath ||
		isRemotePath(filePath) ||
		isAbsoluteFilesystemPath(filePath)
	) {
		return filePath;
	}

	const normalizedRoot = worktreePath.replace(/[\\/]+$/, "");
	const normalizedFile = filePath.replace(/^[\\/]+/, "");
	return `${normalizedRoot}/${normalizedFile}`;
}

export function toRelativeWorkspacePath(
	worktreePath: string,
	filePath: string,
): string {
	if (
		!filePath ||
		isRemotePath(filePath) ||
		!isAbsoluteFilesystemPath(filePath)
	) {
		return filePath.replace(/^[\\/]+/, "");
	}

	const normalizedRoot = normalizeComparablePath(worktreePath);
	const normalizedFile = normalizeComparablePath(filePath);

	if (normalizedFile === normalizedRoot) {
		return ".";
	}

	if (normalizedFile.startsWith(`${normalizedRoot}/`)) {
		return normalizedFile.slice(normalizedRoot.length + 1);
	}

	return filePath;
}

/** Collapse `.` and `..` segments so `/repo/../outside` can't pass a
 * `/repo` prefix check. Operates on an already-normalizeComparablePath'd
 * string; leading root ("" segment) is preserved and never popped. */
function collapseDotSegments(normalizedPath: string): string {
	const out: string[] = [];
	for (const segment of normalizedPath.split("/")) {
		if (segment === ".") continue;
		if (segment === "..") {
			if (out.length > 1 || (out.length === 1 && out[0] !== "")) {
				out.pop();
			}
			continue;
		}
		out.push(segment);
	}
	const joined = out.join("/");
	return joined === "" && normalizedPath.startsWith("/") ? "/" : joined;
}

export function isWithinWorkspacePath(
	worktreePath: string,
	path: string,
): boolean {
	const normalizedRoot = collapseDotSegments(
		normalizeComparablePath(worktreePath),
	);
	const normalizedPath = collapseDotSegments(normalizeComparablePath(path));
	return (
		normalizedPath === normalizedRoot ||
		normalizedPath.startsWith(`${normalizedRoot}/`)
	);
}

export function getPathDirectory(path: string): string {
	const normalizedPath = path.replace(/[\\/]+$/, "");
	const index = Math.max(
		normalizedPath.lastIndexOf("/"),
		normalizedPath.lastIndexOf("\\"),
	);
	if (index === -1) return "";
	return index === 0
		? normalizedPath.slice(0, 1)
		: normalizedPath.slice(0, index);
}

function normalizeComparablePath(path: string): string {
	return path
		.replace(/[\\/]+/g, "/")
		.replace(/\/$/, "")
		.replace(
			WINDOWS_DRIVE_PREFIX,
			(_, driveLetter: string) => `${driveLetter.toLowerCase()}:`,
		);
}
