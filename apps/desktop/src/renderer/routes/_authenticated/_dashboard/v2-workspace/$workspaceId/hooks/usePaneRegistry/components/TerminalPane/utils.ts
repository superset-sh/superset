import { quote } from "shell-quote";

export function shellEscapePaths(paths: string[]): string {
	return quote(paths);
}

/**
 * Null when any file has no path on disk (a screenshot or other copied image
 * data) or a path with a control character, which the PTY could read as input.
 */
export function resolveLocalFilePaths(
	files: File[],
	getPathForFile: (file: File) => string,
): string[] | null {
	if (files.length === 0) return null;
	const paths = files.map(getPathForFile);
	return paths.every((path) => path && !/\p{Cc}/u.test(path)) ? paths : null;
}

/**
 * The form a Terminal.app drag produces. Claude Code turns each image path in
 * it into an attachment; it does not do this for several quoted paths.
 */
export function escapePathsLikeTerminalDrag(paths: string[]): string {
	return paths
		.map((path) => path.replace(/[\s!"#$&'()*,:;<=>?[\\\]^`{|}~]/g, "\\$&"))
		.join(" ");
}
