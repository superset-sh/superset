const WINDOWS_DRIVE_PREFIX = /^([A-Z]):/;

export function isRemotePath(path: string): boolean {
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

export function normalizeComparablePath(path: string): string {
	return path
		.replace(/[\\/]+/g, "/")
		.replace(/\/$/, "")
		.replace(
			WINDOWS_DRIVE_PREFIX,
			(_, driveLetter: string) => `${driveLetter.toLowerCase()}:`,
		);
}

export function pathsMatch(left: string, right: string): boolean {
	return normalizeComparablePath(left) === normalizeComparablePath(right);
}
