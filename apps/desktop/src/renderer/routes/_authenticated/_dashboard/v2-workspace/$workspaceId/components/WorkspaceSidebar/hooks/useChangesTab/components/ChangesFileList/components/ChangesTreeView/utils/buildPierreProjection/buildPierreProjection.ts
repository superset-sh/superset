import type { FileTreeSortComparator } from "@pierre/trees";
import type { ChangesViewMode } from "renderer/routes/_authenticated/providers/CollectionsProvider/dashboardSidebarLocal/schema";

const ROOT_FOLDER_LABEL = "Root Path";
const FOLDER_SEPARATOR = " › ";

export interface PierreProjection {
	paths: string[];
	treePathByFilePath: Map<string, string>;
	filePathByTreePath: Map<string, string>;
	directoryPathByTreePath: Map<string, string>;
}

/**
 * Pierre is path-first, so folder mode projects each immediate parent into one
 * top-level directory. The maps keep every user action keyed to the real path.
 */
export function buildPierreProjection(
	filePaths: string[],
	viewMode: ChangesViewMode,
): PierreProjection {
	if (viewMode === "tree") return buildTreeProjection(filePaths);

	const groupedPaths = new Map<string, string[]>();
	for (const filePath of filePaths) {
		const directoryPath = dirname(filePath);
		const group = groupedPaths.get(directoryPath);
		if (group) group.push(filePath);
		else groupedPaths.set(directoryPath, [filePath]);
	}

	const directoryPaths = [...groupedPaths.keys()].sort(compareDirectoryPaths);
	const usedLabels = new Set<string>();
	const paths: string[] = [];
	const treePathByFilePath = new Map<string, string>();
	const filePathByTreePath = new Map<string, string>();
	const directoryPathByTreePath = new Map<string, string>();

	for (const directoryPath of directoryPaths) {
		const baseLabel =
			directoryPath === ""
				? ROOT_FOLDER_LABEL
				: directoryPath.split("/").join(FOLDER_SEPARATOR);
		const groupLabel = makeUniqueLabel(baseLabel, usedLabels);
		directoryPathByTreePath.set(groupLabel, directoryPath);
		for (const filePath of groupedPaths.get(directoryPath) ?? []) {
			const treePath = `${groupLabel}/${basename(filePath)}`;
			paths.push(treePath);
			treePathByFilePath.set(filePath, treePath);
			filePathByTreePath.set(treePath, filePath);
		}
	}

	return {
		paths,
		treePathByFilePath,
		filePathByTreePath,
		directoryPathByTreePath,
	};
}

export const compareFolderProjectionEntries: FileTreeSortComparator = (
	left,
	right,
) => {
	if (left.isDirectory !== right.isDirectory) return left.isDirectory ? -1 : 1;
	if (left.isDirectory) {
		if (left.basename === ROOT_FOLDER_LABEL) return -1;
		if (right.basename === ROOT_FOLDER_LABEL) return 1;
		return left.basename.localeCompare(right.basename);
	}
	return right.basename.localeCompare(left.basename);
};

function buildTreeProjection(filePaths: string[]): PierreProjection {
	const treePathByFilePath = new Map<string, string>();
	const filePathByTreePath = new Map<string, string>();
	const directoryPathByTreePath = new Map<string, string>();
	for (const filePath of filePaths) {
		treePathByFilePath.set(filePath, filePath);
		filePathByTreePath.set(filePath, filePath);
		const segments = filePath.split("/");
		for (let index = 1; index < segments.length; index++) {
			const directoryPath = segments.slice(0, index).join("/");
			directoryPathByTreePath.set(directoryPath, directoryPath);
		}
	}
	return {
		paths: filePaths,
		treePathByFilePath,
		filePathByTreePath,
		directoryPathByTreePath,
	};
}

function makeUniqueLabel(baseLabel: string, usedLabels: Set<string>): string {
	if (!usedLabels.has(baseLabel)) {
		usedLabels.add(baseLabel);
		return baseLabel;
	}
	let suffix = 2;
	while (usedLabels.has(`${baseLabel} (${suffix})`)) suffix++;
	const label = `${baseLabel} (${suffix})`;
	usedLabels.add(label);
	return label;
}

function compareDirectoryPaths(left: string, right: string): number {
	if (left === "") return right === "" ? 0 : -1;
	if (right === "") return 1;
	return left.localeCompare(right);
}

function dirname(path: string): string {
	const index = path.lastIndexOf("/");
	return index < 0 ? "" : path.slice(0, index);
}

function basename(path: string): string {
	const index = path.lastIndexOf("/");
	return index < 0 ? path : path.slice(index + 1);
}
