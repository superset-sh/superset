import type { ChangedFile } from "../../../../types";

export function partitionByViewed(
	files: ChangedFile[],
	viewedSet: Set<string>,
): ChangedFile[] {
	if (viewedSet.size === 0) return files;
	const unviewed: ChangedFile[] = [];
	const viewed: ChangedFile[] = [];
	for (const file of files) {
		if (viewedSet.has(file.path)) viewed.push(file);
		else unviewed.push(file);
	}
	return [...unviewed, ...viewed];
}
