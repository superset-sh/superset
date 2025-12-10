import type { FileTreeNode, FolderGroup, GitFile } from "./types";

/**
 * Internal type for building the tree structure
 */
type TreeNodeInternal = Omit<FileTreeNode, "children"> & {
	children?: Record<string, TreeNodeInternal>;
};

/**
 * Converts a flat list of git files into a tree structure
 */
export function buildFileTree(files: GitFile[]): FileTreeNode[] {
	const root: Record<string, TreeNodeInternal> = {};

	for (const file of files) {
		const parts = file.path.split("/");
		let current = root;

		for (let i = 0; i < parts.length; i++) {
			const part = parts[i];
			const isLast = i === parts.length - 1;
			const pathSoFar = parts.slice(0, i + 1).join("/");

			if (!current[part]) {
				current[part] = {
					id: pathSoFar,
					name: part,
					type: isLast ? "file" : "folder",
					path: pathSoFar,
					children: isLast ? undefined : {},
				};
			}

			if (isLast) {
				current[part].status = file.status;
				current[part].staged = file.staged;
				current[part].oldPath = file.oldPath;
			} else if (current[part].children) {
				current = current[part].children;
			}
		}
	}

	function convertToArray(
		nodes: Record<string, TreeNodeInternal>,
	): FileTreeNode[] {
		return Object.values(nodes)
			.map((node) => ({
				...node,
				children: node.children ? convertToArray(node.children) : undefined,
			}))
			.sort((a, b) => {
				// Folders first, then files
				if (a.type !== b.type) {
					return a.type === "folder" ? -1 : 1;
				}
				return a.name.localeCompare(b.name);
			});
	}

	return convertToArray(root);
}

/**
 * Groups files by their folder path
 */
export function groupFilesByFolder(files: GitFile[]): FolderGroup[] {
	const folderMap = new Map<string, GitFile[]>();

	for (const file of files) {
		const pathParts = file.path.split("/");
		const folderPath =
			pathParts.length > 1 ? pathParts.slice(0, -1).join("/") : "root";

		if (!folderMap.has(folderPath)) {
			folderMap.set(folderPath, []);
		}
		folderMap.get(folderPath)?.push(file);
	}

	return Array.from(folderMap.entries())
		.map(([folderPath, files]) => {
			const pathParts = folderPath.split("/");
			const folderName =
				pathParts.length > 0 && pathParts[pathParts.length - 1] !== ""
					? pathParts[pathParts.length - 1]
					: "root";

			return {
				folderPath,
				folderName,
				files: files.sort((a, b) => a.name.localeCompare(b.name)),
			};
		})
		.sort((a, b) => {
			if (a.folderPath === "root") return -1;
			if (b.folderPath === "root") return 1;
			return a.folderPath.localeCompare(b.folderPath);
		});
}

/**
 * Gets the status color for a git file status
 */
export function getStatusColor(status: string): string {
	switch (status) {
		case "added":
			return "text-green-500";
		case "modified":
			return "text-yellow-500";
		case "deleted":
			return "text-red-500";
		case "renamed":
			return "text-blue-500";
		case "untracked":
			return "text-gray-500";
		default:
			return "text-muted-foreground";
	}
}

/**
 * Gets the status icon/indicator for a git file status
 */
export function getStatusIndicator(status: string): string {
	switch (status) {
		case "added":
			return "+";
		case "modified":
			return "M";
		case "deleted":
			return "D";
		case "renamed":
			return "R";
		case "untracked":
			return "?";
		default:
			return "";
	}
}
