export function getLineNumbersMinChars(
	original: string,
	modified: string,
): number {
	const originalLines = original.split("\n").length;
	const modifiedLines = modified.split("\n").length;
	const maxLines = Math.max(originalLines, modifiedLines);
	return String(maxLines).length + 1;
}
