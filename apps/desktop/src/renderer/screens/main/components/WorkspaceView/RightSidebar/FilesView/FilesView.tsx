import { useParams } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Tree, type TreeApi } from "react-arborist";
import { dragDropManager } from "renderer/lib/dnd";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { useFileExplorerStore } from "renderer/stores/file-explorer";
import { useTabsStore } from "renderer/stores/tabs/store";
import type {
	DirectoryEntry,
	FileTreeNode as FileTreeNodeType,
} from "shared/file-tree-types";
import useResizeObserver from "use-resize-observer";
import { DeleteConfirmDialog } from "./components/DeleteConfirmDialog";
import { FileSearchResultNode } from "./components/FileSearchResultNode";
import { FileTreeContextMenu } from "./components/FileTreeContextMenu";
import { FileTreeNode } from "./components/FileTreeNode";
import { FileTreeToolbar } from "./components/FileTreeToolbar";
import { NewItemInput } from "./components/NewItemInput";
import {
	OVERSCAN_COUNT,
	ROW_HEIGHT,
	SEARCH_RESULT_ROW_HEIGHT,
	TREE_INDENT,
} from "./constants";
import { useFileSearch } from "./hooks/useFileSearch";
import { useFileTreeActions } from "./hooks/useFileTreeActions";
import type { NewItemMode } from "./types";

export function FilesView() {
	const { workspaceId } = useParams({ strict: false });
	const { data: workspace } = electronTrpc.workspaces.get.useQuery(
		{ id: workspaceId ?? "" },
		{ enabled: !!workspaceId },
	);
	const worktreePath = workspace?.worktreePath;

	const treeRef = useRef<TreeApi<FileTreeNodeType>>(null);
	const { ref: containerRef, height: treeHeight = 400 } = useResizeObserver();

	const {
		expandedFolders,
		searchTerm,
		showHiddenFiles,
		toggleFolder,
		collapseAll,
		setSelectedItems,
		setSearchTerm,
		toggleHiddenFiles,
	} = useFileExplorerStore();

	const currentSearchTerm = worktreePath ? searchTerm[worktreePath] || "" : "";
	const currentExpandedFolders = useMemo(
		() => new Set(worktreePath ? expandedFolders[worktreePath] || [] : []),
		[worktreePath, expandedFolders],
	);

	const [childrenCache, setChildrenCache] = useState<
		Record<string, DirectoryEntry[]>
	>({});
	const [loadingFolders, setLoadingFolders] = useState<Set<string>>(new Set());
	const trpcUtils = electronTrpc.useUtils();

	const {
		data: rootEntries,
		isLoading,
		refetch,
	} = electronTrpc.filesystem.readDirectory.useQuery(
		{
			dirPath: worktreePath || "",
			rootPath: worktreePath || "",
			includeHidden: showHiddenFiles,
		},
		{
			enabled: !!worktreePath,
			staleTime: 5000,
		},
	);

	const entriesToNodes = useCallback(
		(entries: DirectoryEntry[]): FileTreeNodeType[] => {
			return entries.map((entry) => {
				if (!entry.isDirectory) {
					return { ...entry, children: undefined };
				}

				const isExpanded = currentExpandedFolders.has(entry.id);
				const cachedChildren = childrenCache[entry.path];

				if (isExpanded && cachedChildren) {
					return {
						...entry,
						children: entriesToNodes(cachedChildren),
					};
				}

				return { ...entry, children: null };
			});
		},
		[childrenCache, currentExpandedFolders],
	);

	const treeData = useMemo((): FileTreeNodeType[] => {
		if (!rootEntries) return [];
		return entriesToNodes(rootEntries);
	}, [rootEntries, entriesToNodes]);

	const loadChildren = useCallback(
		async (folderPath: string) => {
			if (
				!worktreePath ||
				childrenCache[folderPath] ||
				loadingFolders.has(folderPath)
			) {
				return;
			}

			setLoadingFolders((prev) => new Set(prev).add(folderPath));

			try {
				const children = await trpcUtils.filesystem.readDirectory.fetch({
					dirPath: folderPath,
					rootPath: worktreePath,
					includeHidden: showHiddenFiles,
				});

				setChildrenCache((prev) => ({
					...prev,
					[folderPath]: children,
				}));
			} catch (error) {
				console.error("[FilesView] Failed to load children:", {
					folderPath,
					error,
				});
			} finally {
				setLoadingFolders((prev) => {
					const next = new Set(prev);
					next.delete(folderPath);
					return next;
				});
			}
		},
		[worktreePath, childrenCache, loadingFolders, showHiddenFiles, trpcUtils],
	);

	// biome-ignore lint/correctness/useExhaustiveDependencies: reset cache on workspace/visibility change
	useEffect(() => {
		setChildrenCache({});
	}, [worktreePath, showHiddenFiles]);

	const { createFile, createDirectory, rename, deleteItems, isDeleting } =
		useFileTreeActions({
			worktreePath,
			onRefresh: () => refetch(),
		});

	const {
		searchResults,
		isFetching: isSearchFetching,
		hasQuery,
	} = useFileSearch({
		worktreePath,
		searchTerm: currentSearchTerm,
		includeHidden: showHiddenFiles,
	});
	const isSearching = hasQuery;

	const addFileViewerPane = useTabsStore((s) => s.addFileViewerPane);

	const [newItemMode, setNewItemMode] = useState<NewItemMode>(null);
	const [newItemParentPath, setNewItemParentPath] = useState<string>("");
	const [deleteNode, setDeleteNode] = useState<FileTreeNodeType | null>(null);
	const [showDeleteDialog, setShowDeleteDialog] = useState(false);
	const [contextMenuNode, setContextMenuNode] =
		useState<FileTreeNodeType | null>(null);

	const handleActivate = useCallback(
		(node: { data: FileTreeNodeType }) => {
			if (!workspaceId || !worktreePath || node.data.isDirectory) return;

			addFileViewerPane(workspaceId, {
				filePath: node.data.relativePath,
			});
		},
		[workspaceId, worktreePath, addFileViewerPane],
	);

	const handleSelect = useCallback(
		(nodes: { data: FileTreeNodeType }[]) => {
			if (!worktreePath) return;
			setSelectedItems(
				worktreePath,
				nodes.map((n) => n.data.id),
			);
		},
		[worktreePath, setSelectedItems],
	);

	const handleToggle = useCallback(
		(id: string) => {
			if (!worktreePath) return;
			toggleFolder(worktreePath, id);

			const node = treeRef.current?.get(id);
			if (node?.data.isDirectory && !node.isOpen) {
				loadChildren(node.data.path);
			}
		},
		[worktreePath, toggleFolder, loadChildren],
	);

	const handleRename = useCallback(
		({ id, name }: { id: string; name: string }) => {
			const node = treeRef.current?.get(id)?.data;
			if (node) {
				rename(node.path, name);
			}
		},
		[rename],
	);

	const handleNewFile = useCallback((parentPath: string) => {
		setNewItemMode("file");
		setNewItemParentPath(parentPath);
	}, []);

	const handleNewFolder = useCallback((parentPath: string) => {
		setNewItemMode("folder");
		setNewItemParentPath(parentPath);
	}, []);

	const handleNewItemSubmit = useCallback(
		(name: string) => {
			if (newItemMode === "file") {
				createFile(newItemParentPath, name);
			} else if (newItemMode === "folder") {
				createDirectory(newItemParentPath, name);
			}
			setNewItemMode(null);
			setNewItemParentPath("");
		},
		[newItemMode, newItemParentPath, createFile, createDirectory],
	);

	const handleNewItemCancel = useCallback(() => {
		setNewItemMode(null);
		setNewItemParentPath("");
	}, []);

	const handleDeleteRequest = useCallback((node: FileTreeNodeType) => {
		setDeleteNode(node);
		setShowDeleteDialog(true);
	}, []);

	const handleDeleteConfirm = useCallback(() => {
		if (deleteNode) {
			deleteItems([deleteNode.path]);
		}
		setShowDeleteDialog(false);
		setDeleteNode(null);
	}, [deleteNode, deleteItems]);

	const handleContextMenuRename = useCallback((node: FileTreeNodeType) => {
		treeRef.current?.get(node.id)?.edit();
	}, []);

	const handleSearchChange = useCallback(
		(term: string) => {
			if (!worktreePath) return;
			setSearchTerm(worktreePath, term);
		},
		[worktreePath, setSearchTerm],
	);

	const handleCollapseAll = useCallback(() => {
		if (!worktreePath) return;
		collapseAll(worktreePath);
		treeRef.current?.closeAll();
	}, [worktreePath, collapseAll]);

	const handleRefresh = useCallback(() => {
		setChildrenCache({});
		refetch();
	}, [refetch]);

	if (!worktreePath) {
		return (
			<div className="flex-1 flex items-center justify-center text-muted-foreground text-sm p-4">
				No workspace selected
			</div>
		);
	}

	if (isLoading) {
		return (
			<div className="flex-1 flex items-center justify-center text-muted-foreground text-sm p-4">
				Loading files...
			</div>
		);
	}

	return (
		<div className="flex flex-col h-full">
			<FileTreeToolbar
				searchTerm={currentSearchTerm}
				onSearchChange={handleSearchChange}
				onNewFile={() => handleNewFile(worktreePath)}
				onNewFolder={() => handleNewFolder(worktreePath)}
				onCollapseAll={handleCollapseAll}
				onRefresh={handleRefresh}
				showHiddenFiles={showHiddenFiles}
				onToggleHiddenFiles={toggleHiddenFiles}
			/>

			<FileTreeContextMenu
				node={contextMenuNode}
				worktreePath={worktreePath}
				onNewFile={handleNewFile}
				onNewFolder={handleNewFolder}
				onRename={handleContextMenuRename}
				onDelete={handleDeleteRequest}
			>
				{/* biome-ignore lint/a11y/noStaticElementInteractions: context menu handler for tree container */}
				<div
					ref={containerRef}
					className="flex-1 min-h-0 overflow-hidden"
					onContextMenu={(e) => {
						const nodeEl = (e.target as HTMLElement).closest("[data-node-id]");
						if (nodeEl) {
							const nodeId = nodeEl.getAttribute("data-node-id");
							setContextMenuNode(
								treeRef.current?.get(nodeId || "")?.data || null,
							);
						} else {
							setContextMenuNode(null);
						}
					}}
				>
					{newItemMode && newItemParentPath === worktreePath && (
						<NewItemInput
							mode={newItemMode}
							parentPath={newItemParentPath}
							onSubmit={handleNewItemSubmit}
							onCancel={handleNewItemCancel}
						/>
					)}

					{isSearching ? (
						searchResults.length > 0 ? (
							<Tree<FileTreeNodeType>
								ref={treeRef}
								data={searchResults}
								width="100%"
								height={treeHeight}
								rowHeight={SEARCH_RESULT_ROW_HEIGHT}
								indent={0}
								overscanCount={OVERSCAN_COUNT}
								idAccessor="id"
								childrenAccessor="children"
								openByDefault={false}
								disableMultiSelection={false}
								onActivate={handleActivate}
								onSelect={handleSelect}
								onRename={handleRename}
								dndManager={dragDropManager}
							>
								{FileSearchResultNode}
							</Tree>
						) : (
							<div className="flex-1 flex items-center justify-center text-muted-foreground text-sm p-4">
								{isSearchFetching ? "Searching files..." : "No matching files"}
							</div>
						)
					) : (
						<Tree<FileTreeNodeType>
							ref={treeRef}
							data={treeData}
							width="100%"
							height={treeHeight}
							rowHeight={ROW_HEIGHT}
							indent={TREE_INDENT}
							overscanCount={OVERSCAN_COUNT}
							idAccessor="id"
							childrenAccessor="children"
							openByDefault={false}
							disableMultiSelection={false}
							onActivate={handleActivate}
							onSelect={handleSelect}
							onToggle={handleToggle}
							onRename={handleRename}
							dndManager={dragDropManager}
						>
							{FileTreeNode}
						</Tree>
					)}
				</div>
			</FileTreeContextMenu>

			<DeleteConfirmDialog
				node={deleteNode}
				open={showDeleteDialog}
				onOpenChange={setShowDeleteDialog}
				onConfirm={handleDeleteConfirm}
				isDeleting={isDeleting}
			/>
		</div>
	);
}
