import { useParams } from "@tanstack/react-router";
import { useCallback, useMemo, useRef, useState } from "react";
import { Tree, type TreeApi } from "react-arborist";
import { dragDropManager } from "renderer/lib/dnd";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { useFileExplorerStore } from "renderer/stores/file-explorer";
import { useTabsStore } from "renderer/stores/tabs/store";
import type { FileTreeNode as FileTreeNodeType } from "shared/file-tree-types";
import { DeleteConfirmDialog } from "./components/DeleteConfirmDialog";
import { FileTreeContextMenu } from "./components/FileTreeContextMenu";
import { FileTreeNode } from "./components/FileTreeNode";
import { FileTreeToolbar } from "./components/FileTreeToolbar";
import { NewItemInput } from "./components/NewItemInput";
import { OVERSCAN_COUNT, ROW_HEIGHT, TREE_INDENT } from "./constants";
import { useFileTreeActions } from "./hooks/useFileTreeActions";
import type { NewItemMode } from "./types";

export function FilesView() {
	const { workspaceId } = useParams({ strict: false });
	const { data: workspace } = electronTrpc.workspaces.get.useQuery(
		{ id: workspaceId ?? "" },
		{ enabled: !!workspaceId },
	);
	const worktreePath = workspace?.worktreePath;

	// Tree ref for programmatic control
	const treeRef = useRef<TreeApi<FileTreeNodeType>>(null);

	// Store state
	const {
		searchTerm,
		showHiddenFiles,
		toggleFolder,
		collapseAll,
		setSelectedItems,
		setSearchTerm,
		toggleHiddenFiles,
	} = useFileExplorerStore();

	const currentSearchTerm = worktreePath ? searchTerm[worktreePath] || "" : "";

	// Query for root directory
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

	// Build tree data from root entries
	const treeData = useMemo((): FileTreeNodeType[] => {
		if (!rootEntries) return [];

		return rootEntries.map((entry) => ({
			...entry,
			children: entry.isDirectory ? null : undefined,
		}));
	}, [rootEntries]);

	// Actions
	const { createFile, createDirectory, rename, deleteItems, isDeleting } =
		useFileTreeActions({
			worktreePath,
			onRefresh: () => refetch(),
		});

	// Tab store for opening files
	const addFileViewerPane = useTabsStore((s) => s.addFileViewerPane);

	// New item state
	const [newItemMode, setNewItemMode] = useState<NewItemMode>(null);
	const [newItemParentPath, setNewItemParentPath] = useState<string>("");

	// Delete confirmation state
	const [deleteNode, setDeleteNode] = useState<FileTreeNodeType | null>(null);
	const [showDeleteDialog, setShowDeleteDialog] = useState(false);

	// Context menu target
	const [contextMenuNode, setContextMenuNode] =
		useState<FileTreeNodeType | null>(null);

	// Handle file double-click to open in editor pane
	const handleActivate = useCallback(
		(node: { data: FileTreeNodeType }) => {
			if (!workspaceId || !worktreePath || node.data.isDirectory) return;

			addFileViewerPane(workspaceId, {
				filePath: node.data.relativePath,
			});
		},
		[workspaceId, worktreePath, addFileViewerPane],
	);

	// Handle selection change
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

	// Handle folder toggle
	const handleToggle = useCallback(
		(id: string) => {
			if (!worktreePath) return;
			toggleFolder(worktreePath, id);
		},
		[worktreePath, toggleFolder],
	);

	// Handle rename
	const handleRename = useCallback(
		({ id, name }: { id: string; name: string }) => {
			const node = treeData.find((n) => n.id === id);
			if (node) {
				rename(node.path, name);
			}
		},
		[treeData, rename],
	);

	// Handle new file/folder
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

	// Handle delete
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

	// Handle context menu rename
	const handleContextMenuRename = useCallback((node: FileTreeNodeType) => {
		// Find the node in the tree and trigger edit mode
		const treeNode = treeRef.current?.get(node.id);
		if (treeNode) {
			treeNode.edit();
		}
	}, []);

	// Toolbar handlers
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
		refetch();
	}, [refetch]);

	// Render loading state
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
					className="flex-1 overflow-hidden"
					onContextMenu={(e) => {
						// Get clicked node from event target
						const target = e.target as HTMLElement;
						const nodeEl = target.closest("[data-node-id]");
						if (nodeEl) {
							const nodeId = nodeEl.getAttribute("data-node-id");
							const node = treeRef.current?.get(nodeId || "");
							setContextMenuNode(node?.data || null);
						} else {
							setContextMenuNode(null);
						}
					}}
				>
					{/* New item input at root level */}
					{newItemMode && newItemParentPath === worktreePath && (
						<NewItemInput
							mode={newItemMode}
							parentPath={newItemParentPath}
							onSubmit={handleNewItemSubmit}
							onCancel={handleNewItemCancel}
						/>
					)}

					<Tree<FileTreeNodeType>
						ref={treeRef}
						data={treeData}
						width="100%"
						height={600}
						rowHeight={ROW_HEIGHT}
						indent={TREE_INDENT}
						overscanCount={OVERSCAN_COUNT}
						idAccessor="id"
						childrenAccessor="children"
						openByDefault={false}
						disableMultiSelection={false}
						searchTerm={currentSearchTerm}
						searchMatch={(node, term) =>
							node.data.name.toLowerCase().includes(term.toLowerCase())
						}
						onActivate={handleActivate}
						onSelect={handleSelect}
						onToggle={handleToggle}
						onRename={handleRename}
						dndManager={dragDropManager}
					>
						{FileTreeNode}
					</Tree>
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
