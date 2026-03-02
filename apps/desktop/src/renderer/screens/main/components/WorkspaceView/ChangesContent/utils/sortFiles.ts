import type { ChangedFile } from "shared/changes-types";

export function sortFilesTreeOrder(files: ChangedFile[]): ChangedFile[] {
	if (files.length === 0) return [];

	interface TreeNode {
		name: string;
		path: string;
		file?: ChangedFile;
		children: Map<string, TreeNode>;
	}

	const root: Map<string, TreeNode> = new Map();

	for (const file of files) {
		const parts = file.path.split("/");
		let current: Map<string, TreeNode> = root;

		for (let i = 0; i < parts.length; i++) {
			const part = parts[i];
			const isLast = i === parts.length - 1;
			const pathSoFar = parts.slice(0, i + 1).join("/");

			if (!current.has(part)) {
				current.set(part, {
					name: part,
					path: pathSoFar,
					file: isLast ? file : undefined,
					children: new Map(),
				});
			} else if (isLast) {
				const node = current.get(part);
				if (node) node.file = file;
			}

			if (!isLast) {
				const node = current.get(part);
				if (node) current = node.children;
			}
		}
	}

	const result: ChangedFile[] = [];

	function traverse(nodes: Map<string, TreeNode>) {
		const sorted = Array.from(nodes.values()).sort((a, b) => {
			const aIsFolder = a.children.size > 0 || !a.file;
			const bIsFolder = b.children.size > 0 || !b.file;
			if (aIsFolder !== bIsFolder) {
				return aIsFolder ? -1 : 1;
			}
			return a.name.localeCompare(b.name);
		});

		for (const node of sorted) {
			if (node.file) {
				result.push(node.file);
			}
			if (node.children.size > 0) {
				traverse(node.children);
			}
		}
	}

	traverse(root);
	return result;
}

export function sortFilesGroupedOrder(files: ChangedFile[]): ChangedFile[] {
	if (files.length === 0) return [];

	const folderMap = new Map<string, ChangedFile[]>();

	for (const file of files) {
		const pathParts = file.path.split("/");
		const folderPath =
			pathParts.length > 1 ? pathParts.slice(0, -1).join("/") : "";

		if (!folderMap.has(folderPath)) {
			folderMap.set(folderPath, []);
		}
		const folderFiles = folderMap.get(folderPath);
		if (folderFiles) folderFiles.push(file);
	}

	const sortedFolders = Array.from(folderMap.keys()).sort((a, b) =>
		a.localeCompare(b),
	);

	const result: ChangedFile[] = [];
	for (const folder of sortedFolders) {
		const folderFiles = folderMap.get(folder);
		if (!folderFiles) continue;
		folderFiles.sort((a, b) => {
			const aName = a.path.split("/").pop() || "";
			const bName = b.path.split("/").pop() || "";
			return aName.localeCompare(bName);
		});
		result.push(...folderFiles);
	}

	return result;
}

export type FileListViewMode = "tree" | "grouped";

export function sortFiles(
	files: ChangedFile[],
	viewMode: FileListViewMode,
): ChangedFile[] {
	return viewMode === "tree"
		? sortFilesTreeOrder(files)
		: sortFilesGroupedOrder(files);
}
