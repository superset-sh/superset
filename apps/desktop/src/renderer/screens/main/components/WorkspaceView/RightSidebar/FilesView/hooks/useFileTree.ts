import { useCallback, useEffect, useMemo, useState } from "react";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { useFileExplorerStore } from "renderer/stores/file-explorer";
import type { FileTreeNode } from "shared/file-tree-types";

interface UseFileTreeProps {
	worktreePath: string | undefined;
}

interface UseFileTreeReturn {
	treeData: FileTreeNode[];
	isLoading: boolean;
	error: Error | null;
	refetch: () => void;
	loadChildren: (nodeId: string, nodePath: string) => Promise<FileTreeNode[]>;
}

export function useFileTree({
	worktreePath,
}: UseFileTreeProps): UseFileTreeReturn {
	const [treeData, setTreeData] = useState<FileTreeNode[]>([]);
	const [childrenCache, setChildrenCache] = useState<
		Record<string, FileTreeNode[]>
	>({});

	const { showHiddenFiles, expandedFolders } = useFileExplorerStore();
	const includeHidden = worktreePath
		? (showHiddenFiles[worktreePath] ?? false)
		: false;
	const currentExpandedFolders = worktreePath
		? expandedFolders[worktreePath] || []
		: [];

	const trpcUtils = electronTrpc.useUtils();

	const {
		data: rootEntries,
		isLoading,
		error,
		refetch,
	} = electronTrpc.filesystem.readDirectory.useQuery(
		{
			dirPath: worktreePath || "",
			rootPath: worktreePath || "",
			includeHidden,
		},
		{
			enabled: !!worktreePath,
			staleTime: 5000,
		},
	);

	const rootNodes = useMemo((): FileTreeNode[] => {
		if (!rootEntries) return [];

		return rootEntries.map((entry) => ({
			...entry,
			children: entry.isDirectory ? null : undefined,
		}));
	}, [rootEntries]);

	const buildTree = useCallback(
		(nodes: FileTreeNode[]): FileTreeNode[] => {
			return nodes.map((node) => {
				if (!node.isDirectory) {
					return node;
				}

				const isExpanded = currentExpandedFolders.includes(node.id);
				const cachedChildren = childrenCache[node.id];

				if (!isExpanded) {
					return { ...node, children: null };
				}

				if (cachedChildren) {
					return {
						...node,
						children: buildTree(cachedChildren),
					};
				}

				return { ...node, children: null, isLoading: true };
			});
		},
		[currentExpandedFolders, childrenCache],
	);

	useEffect(() => {
		setTreeData(buildTree(rootNodes));
	}, [rootNodes, buildTree]);

	const loadChildren = useCallback(
		async (nodeId: string, nodePath: string): Promise<FileTreeNode[]> => {
			if (!worktreePath) return [];

			if (childrenCache[nodeId]) {
				return childrenCache[nodeId];
			}

			try {
				const entries = await trpcUtils.filesystem.readDirectory.fetch({
					dirPath: nodePath,
					rootPath: worktreePath,
					includeHidden,
				});

				const childNodes: FileTreeNode[] = entries.map((entry) => ({
					...entry,
					children: entry.isDirectory ? null : undefined,
				}));

				setChildrenCache((prev) => ({
					...prev,
					[nodeId]: childNodes,
				}));

				return childNodes;
			} catch (err) {
				console.error("[useFileTree] Failed to load children:", {
					nodeId,
					nodePath,
					error: err,
				});
				return [];
			}
		},
		[worktreePath, includeHidden, childrenCache, trpcUtils],
	);

	return {
		treeData,
		isLoading,
		error: error as Error | null,
		refetch: () => {
			setChildrenCache({});
			refetch();
		},
		loadChildren,
	};
}
