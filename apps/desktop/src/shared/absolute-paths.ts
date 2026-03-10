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

export function getPathBaseName(path: string): string {
	const normalizedPath = path.replace(/[\\/]+$/, "");
	if (!normalizedPath) {
		return path;
	}

	const segments = normalizedPath.split(/[\\/]/);
	return segments[segments.length - 1] || path;
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

export function retargetAbsolutePath(
	currentPath: string,
	oldAbsolutePath: string,
	newAbsolutePath: string,
	isDirectory: boolean,
): string | null {
	const normalizedCurrentPath = normalizeComparablePath(currentPath);
	const normalizedOldPath = normalizeComparablePath(oldAbsolutePath);

	if (normalizedCurrentPath === normalizedOldPath) {
		return newAbsolutePath;
	}

	if (!isDirectory) {
		return null;
	}

	if (!normalizedCurrentPath.startsWith(`${normalizedOldPath}/`)) {
		return null;
	}

	const suffix = normalizedCurrentPath.slice(normalizedOldPath.length);
	const separator = newAbsolutePath.includes("\\") ? "\\" : "/";
	const normalizedNewAbsolutePath = newAbsolutePath.replace(/[\\/]+/g, "/");
	return `${normalizedNewAbsolutePath}${suffix}`.replace(/\//g, separator);
}
