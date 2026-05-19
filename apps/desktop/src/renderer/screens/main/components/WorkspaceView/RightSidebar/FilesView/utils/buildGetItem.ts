import { toRelativeWorkspacePath } from "shared/absolute-paths";
import type { DirectoryEntry } from "shared/file-tree-types";

export interface ListDirectoryEntry {
	absolutePath: string;
	name: string;
	kind: "directory" | "file" | "symlink" | "other";
}

export interface BuildGetItemOptions {
	worktreePathRef: { current: string | undefined };
	entryCacheRef: { current: Map<string, DirectoryEntry> };
	listDirectory: (absolutePath: string) => Promise<{
		entries: ListDirectoryEntry[];
	}>;
}

function getEntryRelativePath(rootPath: string, absolutePath: string): string {
	const relativePath = toRelativeWorkspacePath(rootPath, absolutePath);
	return relativePath === "." ? "" : relativePath;
}

function getParentPath(absolutePath: string): string {
	const trimmedPath = absolutePath.replace(/[\\/]+$/, "");
	const lastSeparatorIndex = Math.max(
		trimmedPath.lastIndexOf("/"),
		trimmedPath.lastIndexOf("\\"),
	);

	if (lastSeparatorIndex <= 0) {
		return trimmedPath;
	}

	if (/^[A-Za-z]:$/.test(trimmedPath.slice(0, lastSeparatorIndex))) {
		return `${trimmedPath.slice(0, lastSeparatorIndex)}\\`;
	}

	return trimmedPath.slice(0, lastSeparatorIndex);
}

export function buildGetItem({
	worktreePathRef,
	entryCacheRef,
	listDirectory,
}: BuildGetItemOptions): (itemId: string) => Promise<DirectoryEntry> {
	return async function getItem(itemId: string): Promise<DirectoryEntry> {
		if (itemId === "root") {
			return {
				id: "root",
				name: "root",
				path: worktreePathRef.current ?? "",
				relativePath: "",
				isDirectory: true,
			};
		}

		const cachedEntry = entryCacheRef.current.get(itemId);
		if (cachedEntry) {
			return cachedEntry;
		}

		const currentPath = worktreePathRef.current;
		const name = itemId.split(/[/\\]/).pop() ?? itemId;
		const relativePath = currentPath
			? getEntryRelativePath(currentPath, itemId)
			: itemId;

		const parentPath = getParentPath(itemId);
		if (parentPath && parentPath !== itemId) {
			try {
				const { entries } = await listDirectory(parentPath);
				const matched = entries.find((entry) => entry.absolutePath === itemId);
				if (matched) {
					const resolvedEntry: DirectoryEntry = {
						id: matched.absolutePath,
						name: matched.name,
						path: matched.absolutePath,
						relativePath: currentPath
							? getEntryRelativePath(currentPath, matched.absolutePath)
							: matched.absolutePath,
						isDirectory: matched.kind === "directory",
					};
					entryCacheRef.current.set(resolvedEntry.path, resolvedEntry);
					return resolvedEntry;
				}
			} catch {
				// Fall through to placeholder entry below.
			}
		}

		return {
			id: itemId,
			name,
			path: itemId,
			relativePath,
			isDirectory: false,
		};
	};
}
