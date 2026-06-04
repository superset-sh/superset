import path from "node:path";

export function normalizeAbsolutePath(input: string): string {
	return path.normalize(path.resolve(input));
}

export function toRelativePath(rootPath: string, absolutePath: string): string {
	return path.relative(
		normalizeAbsolutePath(rootPath),
		normalizeAbsolutePath(absolutePath),
	);
}

export function isPathWithinRoot(
	rootPath: string,
	absolutePath: string,
): boolean {
	const normalizedRootPath = normalizeAbsolutePath(rootPath);
	const normalizedAbsolutePath = normalizeAbsolutePath(absolutePath);

	if (normalizedRootPath === normalizedAbsolutePath) {
		return true;
	}

	const relativePath = path.relative(
		normalizedRootPath,
		normalizedAbsolutePath,
	);

	return (
		relativePath !== ".." &&
		!relativePath.startsWith(`..${path.sep}`) &&
		!path.isAbsolute(relativePath)
	);
}
