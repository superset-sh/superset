import { useMemo } from "react";
import type { ChangedFile, FileTreeNode } from "../types";

/**
 * Convert a flat list of changed files into a tree structure
 * grouped by folder hierarchy
 */
export function useFileTree(files: ChangedFile[]): FileTreeNode {
	return useMemo(() => {
		const root: FileTreeNode = {
			name: "",
			path: "",
			isFolder: true,
			children: [],
		};

		// Sort files by path for consistent ordering
		const sortedFiles = [...files].sort((a, b) => a.path.localeCompare(b.path));

		for (const file of sortedFiles) {
			const parts = file.path.split("/");
			let current = root;

			// Navigate/create folder structure
			for (let i = 0; i < parts.length - 1; i++) {
				const folderPath = parts.slice(0, i + 1).join("/");
				const folderName = parts[i];

				let folder = current.children?.find(
					(c): c is FileTreeNode => c.isFolder && c.path === folderPath,
				);

				if (!folder) {
					folder = {
						name: folderName,
						path: folderPath,
						isFolder: true,
						children: [],
					};
					current.children = current.children || [];
					current.children.push(folder);
				}
				current = folder;
			}

			// Add file to current folder
			const fileName = parts[parts.length - 1];
			current.children = current.children || [];
			current.children.push({
				name: fileName,
				path: file.path,
				isFolder: false,
				file,
			});
		}

		// Sort children: folders first, then files, both alphabetically
		const sortChildren = (node: FileTreeNode) => {
			if (node.children) {
				node.children.sort((a, b) => {
					if (a.isFolder && !b.isFolder) return -1;
					if (!a.isFolder && b.isFolder) return 1;
					return a.name.localeCompare(b.name);
				});
				for (const child of node.children) {
					sortChildren(child);
				}
			}
		};
		sortChildren(root);

		return root;
	}, [files]);
}

/**
 * Get all folder paths from a file tree (for expand all functionality)
 */
export function getAllFolderPaths(root: FileTreeNode): string[] {
	const paths: string[] = [];

	const traverse = (node: FileTreeNode) => {
		if (node.isFolder && node.path) {
			paths.push(node.path);
		}
		for (const child of node.children || []) {
			traverse(child);
		}
	};

	traverse(root);
	return paths;
}
