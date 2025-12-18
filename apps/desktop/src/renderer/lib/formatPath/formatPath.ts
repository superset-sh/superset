/**
 * Normalizes path separators to forward slashes for consistent handling
 */
function normalizeSeparators(path: string): string {
	return path.replace(/\\/g, "/");
}

/**
 * Shortens a path by replacing the home directory with ~
 * Handles both Unix and Windows paths.
 */
export function shortenHomePath(
	path: string,
	homeDir: string | undefined,
): string {
	const normalizedPath = normalizeSeparators(path);
	const normalizedHome = homeDir ? normalizeSeparators(homeDir) : null;

	if (
		normalizedHome &&
		(normalizedPath === normalizedHome ||
			normalizedPath.startsWith(`${normalizedHome}/`))
	) {
		return `~${normalizedPath.slice(normalizedHome.length)}`;
	}

	// Fallback: try common Unix patterns if home dir not available
	return normalizedPath.replace(/^\/(?:Users|home)\/[^/]+/, "~");
}

/**
 * Formats a path for display, replacing the home directory with ~ and optionally
 * removing the trailing project name directory.
 * Handles both Unix and Windows paths.
 */
export function formatPathWithProject(
	path: string,
	projectName: string,
	homeDir: string | undefined,
): { display: string; full: string } {
	const fullPath = shortenHomePath(path, homeDir);

	// Escape special regex characters in project name
	const escapedProjectName = projectName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	const suffixPattern = new RegExp(`/${escapedProjectName}$`);

	// Remove trailing project name directory if it matches
	const displayPath = fullPath.replace(suffixPattern, "");

	return { display: displayPath, full: fullPath };
}
