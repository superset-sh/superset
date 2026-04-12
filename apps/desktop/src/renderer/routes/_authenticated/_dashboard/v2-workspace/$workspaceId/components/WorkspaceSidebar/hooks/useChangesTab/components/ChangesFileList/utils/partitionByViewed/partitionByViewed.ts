import type { ChangesetFile } from "../../../../../../../../hooks/useChangeset";

export function partitionByViewed(
	files: ChangesetFile[],
	viewedSet: Set<string>,
): ChangesetFile[] {
	if (viewedSet.size === 0) return files;
	const unviewed: ChangesetFile[] = [];
	const viewed: ChangesetFile[] = [];
	for (const file of files) {
		if (viewedSet.has(file.path)) viewed.push(file);
		else unviewed.push(file);
	}
	return [...unviewed, ...viewed];
}
