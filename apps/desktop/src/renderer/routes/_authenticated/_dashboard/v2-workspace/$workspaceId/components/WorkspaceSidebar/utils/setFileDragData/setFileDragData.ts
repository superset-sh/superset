export const FILE_PATH_MIME = "application/x-superset-file-path";

/**
 * Stamp a native drag with a file's absolute path. `text/plain` is what the
 * terminal pane (and any plain text input) reads on drop; the custom MIME
 * lets drop targets tell a file-path drag apart from arbitrary text.
 */
export function setFileDragData(
	dataTransfer: DataTransfer,
	absolutePath: string,
	effectAllowed: DataTransfer["effectAllowed"] = "copy",
): void {
	dataTransfer.setData("text/plain", absolutePath);
	dataTransfer.setData(FILE_PATH_MIME, absolutePath);
	dataTransfer.effectAllowed = effectAllowed;
}
