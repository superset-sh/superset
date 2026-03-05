import {
	asyncDataLoaderFeature,
	expandAllFeature,
	type ItemInstance,
	selectionFeature,
} from "@headless-tree/core";
import { useTree } from "@headless-tree/react";
import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuTrigger,
} from "@superset/ui/context-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { cn } from "@superset/ui/utils";
import { useParams } from "@tanstack/react-router";
import { dirname } from "pathe";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { LuChevronRight, LuFile, LuFolder, LuHouse } from "react-icons/lu";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { useFileExplorerStore } from "renderer/stores/file-explorer";
import { useTabsStore } from "renderer/stores/tabs/store";
import type { DirectoryEntry } from "shared/file-tree-types";
import { DeleteConfirmDialog } from "./components/DeleteConfirmDialog";
import { FileSearchResultItem } from "./components/FileSearchResultItem";
import { FileTreeItem } from "./components/FileTreeItem";
import { FileTreeToolbar } from "./components/FileTreeToolbar";
import { NewItemInput } from "./components/NewItemInput";
import { RenameInput } from "./components/RenameInput";
import { ROW_HEIGHT, TREE_INDENT } from "./constants";
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

	const [searchTerm, setSearchTerm] = useState("");
	// browseRoot allows navigating outside the worktree directory
	const [browseRoot, setBrowseRoot] = useState<string | null>(null);
	const effectiveRoot = browseRoot ?? worktreePath;
	const isOutsideWorktree = browseRoot !== null && browseRoot !== worktreePath;

	const projectId = workspace?.project?.id;
	const showHiddenFiles = useFileExplorerStore((s) =>
		projectId ? (s.showHiddenFiles[projectId] ?? false) : false,
	);
	const toggleHiddenFiles = useFileExplorerStore((s) => s.toggleHiddenFiles);

	// Refs avoid stale closure in dataLoader callbacks
	const effectiveRootRef = useRef(effectiveRoot);
	effectiveRootRef.current = effectiveRoot;
	const showHiddenFilesRef = useRef(showHiddenFiles);
	showHiddenFilesRef.current = showHiddenFiles;

	const trpcUtils = electronTrpc.useUtils();

	const tree = useTree<DirectoryEntry>({
		rootItemId: "root",
		getItemName: (item: ItemInstance<DirectoryEntry>) =>
			item.getItemData()?.name ?? "",
		isItemFolder: (item: ItemInstance<DirectoryEntry>) =>
			item.getItemData()?.isDirectory ?? false,
		dataLoader: {
			getItem: async (itemId: string): Promise<DirectoryEntry> => {
				if (itemId === "root") {
					return {
						id: "root",
						name: "root",
						path: effectiveRootRef.current ?? "",
						relativePath: "",
						isDirectory: true,
					};
				}
				const parts = itemId.split(":::");
				return {
					id: itemId,
					name: parts[1] ?? itemId,
					path: parts[0] ?? itemId,
					relativePath: parts[2] ?? "",
					isDirectory: parts[3] === "true",
				};
			},
			getChildren: async (itemId: string): Promise<string[]> => {
				const currentRoot = effectiveRootRef.current;
				if (!currentRoot) return [];

				const dirPath =
					itemId === "root" ? currentRoot : itemId.split(":::")[0];
				if (!dirPath) return [];

				try {
					const entries = await trpcUtils.filesystem.readDirectory.fetch({
						dirPath,
						rootPath: currentRoot,
						includeHidden: showHiddenFilesRef.current,
					});
					return entries.map(
						(e) =>
							`${e.path}:::${e.name}:::${e.relativePath}:::${e.isDirectory}`,
					);
				} catch (error) {
					console.error("[FilesView] Failed to load children:", error);
					return [];
				}
			},
		},
		features: [asyncDataLoaderFeature, selectionFeature, expandAllFeature],
	});

	const prevEffectiveRootRef = useRef(effectiveRoot);
	useEffect(() => {
		if (
			effectiveRoot &&
			prevEffectiveRootRef.current !== effectiveRoot &&
			prevEffectiveRootRef.current !== undefined
		) {
			tree.getItemInstance("root")?.invalidateChildrenIds();
		}
		prevEffectiveRootRef.current = effectiveRoot;
	}, [effectiveRoot, tree]);

	// Reset browseRoot when switching workspaces
	// biome-ignore lint/correctness/useExhaustiveDependencies: Reset on worktree change only
	useEffect(() => {
		setBrowseRoot(null);
	}, [worktreePath]);

	const navigateToParent = useCallback(() => {
		const current = effectiveRoot;
		if (!current || current === "/") return;
		setBrowseRoot(dirname(current));
	}, [effectiveRoot]);

	const navigateHome = useCallback(() => {
		setBrowseRoot(null);
	}, []);

	const { createFile, createDirectory, rename, deleteItems, isDeleting } =
		useFileTreeActions({
			worktreePath,
			onRefresh: async (parentPath: string) => {
				const isRoot = parentPath === effectiveRoot;
				const itemId = isRoot
					? "root"
					: tree
							.getItems()
							.find(
								(item: ItemInstance<DirectoryEntry>) =>
									item.getItemData()?.path === parentPath,
							)
							?.getId();
				if (itemId) {
					await tree.getItemInstance(itemId)?.invalidateChildrenIds();
				}
			},
		});

	const {
		searchResults,
		isFetching: isSearchFetching,
		hasQuery: isSearching,
	} = useFileSearch({
		worktreePath: effectiveRoot,
		searchTerm,
		includeHidden: showHiddenFiles,
	});

	const addFileViewerPane = useTabsStore((s) => s.addFileViewerPane);
	const openFileInEditorMutation =
		electronTrpc.external.openFileInEditor.useMutation();

	const [newItemMode, setNewItemMode] = useState<NewItemMode>(null);
	const [newItemParentPath, setNewItemParentPath] = useState<string>("");
	const [renameEntry, setRenameEntry] = useState<DirectoryEntry | null>(null);
	const [deleteEntry, setDeleteEntry] = useState<DirectoryEntry | null>(null);
	const [showDeleteDialog, setShowDeleteDialog] = useState(false);

	const handleFileActivate = useCallback(
		(entry: DirectoryEntry) => {
			if (!workspaceId || !worktreePath || entry.isDirectory) return;
			addFileViewerPane(workspaceId, { filePath: entry.path });
		},
		[workspaceId, worktreePath, addFileViewerPane],
	);

	const handleOpenInEditor = useCallback(
		(entry: DirectoryEntry) => {
			if (!worktreePath) return;
			openFileInEditorMutation.mutate({
				path: entry.path,
				cwd: worktreePath,
				projectId,
			});
		},
		[worktreePath, projectId, openFileInEditorMutation],
	);

	const handleNewFile = useCallback(
		async (parentPath: string) => {
			if (parentPath !== effectiveRoot) {
				const item = tree
					.getItems()
					.find(
						(i: ItemInstance<DirectoryEntry>) =>
							i.getItemData()?.path === parentPath,
					);
				if (item && !item.isExpanded()) {
					await item.expand();
				}
			}
			setNewItemMode("file");
			setNewItemParentPath(parentPath);
		},
		[effectiveRoot, tree],
	);

	const handleNewFolder = useCallback(
		async (parentPath: string) => {
			if (parentPath !== effectiveRoot) {
				const item = tree
					.getItems()
					.find(
						(i: ItemInstance<DirectoryEntry>) =>
							i.getItemData()?.path === parentPath,
					);
				if (item && !item.isExpanded()) {
					await item.expand();
				}
			}
			setNewItemMode("folder");
			setNewItemParentPath(parentPath);
		},
		[effectiveRoot, tree],
	);

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

	const handleDeleteRequest = useCallback((entry: DirectoryEntry) => {
		setDeleteEntry(entry);
		setShowDeleteDialog(true);
	}, []);

	const handleDeleteConfirm = useCallback(() => {
		if (deleteEntry) {
			deleteItems([deleteEntry.path]);
		}
		setShowDeleteDialog(false);
		setDeleteEntry(null);
	}, [deleteEntry, deleteItems]);

	const handleRename = useCallback((entry: DirectoryEntry) => {
		setRenameEntry(entry);
	}, []);

	const handleRenameSubmit = useCallback(
		(newName: string) => {
			if (renameEntry) {
				rename(renameEntry.path, newName);
			}
			setRenameEntry(null);
		},
		[renameEntry, rename],
	);

	const handleRenameCancel = useCallback(() => {
		setRenameEntry(null);
	}, []);

	const handleCollapseAll = useCallback(() => {
		tree.collapseAll();
	}, [tree]);

	const handleRefresh = useCallback(() => {
		// Invalidate root explicitly (getItems() may not include it)
		tree.getItemInstance("root")?.invalidateChildrenIds();
		// Also invalidate all expanded directories so new files in nested folders appear
		for (const item of tree.getItems()) {
			if (item.getItemData()?.isDirectory) {
				item.invalidateChildrenIds();
			}
		}
	}, [tree]);

	const handleToggleHiddenFiles = useCallback(() => {
		if (!projectId) return;
		// Update ref synchronously so invalidation uses correct value
		showHiddenFilesRef.current = !showHiddenFilesRef.current;
		toggleHiddenFiles(projectId);
		// invalidateChildrenIds doesn't cascade, so invalidate every directory
		tree.getItemInstance("root")?.invalidateChildrenIds();
		for (const item of tree.getItems()) {
			if (item.getItemData()?.isDirectory) {
				item.invalidateChildrenIds();
			}
		}
	}, [tree, projectId, toggleHiddenFiles]);

	const searchResultEntries = useMemo(() => {
		return searchResults.map((result) => ({
			id: result.id,
			name: result.name,
			path: result.path,
			relativePath: result.relativePath,
			isDirectory: result.isDirectory,
		}));
	}, [searchResults]);

	// Build breadcrumb segments for the current browse root
	const breadcrumbSegments = useMemo(() => {
		if (!isOutsideWorktree || !effectiveRoot) return null;
		const parts = effectiveRoot.split("/").filter(Boolean);
		return parts.map((name, i) => ({
			name,
			path: `/${parts.slice(0, i + 1).join("/")}`,
		}));
	}, [isOutsideWorktree, effectiveRoot]);

	if (!worktreePath) {
		return (
			<div className="flex-1 flex items-center justify-center text-muted-foreground text-sm p-4">
				No workspace selected
			</div>
		);
	}

	return (
		<div className="flex flex-col flex-1 min-h-0">
			<FileTreeToolbar
				searchTerm={searchTerm}
				onSearchChange={setSearchTerm}
				onNewFile={() => handleNewFile(effectiveRoot ?? worktreePath)}
				onNewFolder={() => handleNewFolder(effectiveRoot ?? worktreePath)}
				onCollapseAll={handleCollapseAll}
				onRefresh={handleRefresh}
				showHiddenFiles={showHiddenFiles}
				onToggleHiddenFiles={handleToggleHiddenFiles}
				onNavigateToParent={navigateToParent}
				onNavigateHome={isOutsideWorktree ? navigateHome : undefined}
			/>

			{breadcrumbSegments && (
				<div className="flex items-center gap-0.5 px-2 py-1 border-b border-border text-xs text-muted-foreground overflow-x-auto shrink-0">
					<Tooltip>
						<TooltipTrigger asChild>
							<button
								type="button"
								onClick={navigateHome}
								className="shrink-0 p-0.5 rounded hover:bg-accent/50 hover:text-foreground transition-colors"
							>
								<LuHouse className="size-3" />
							</button>
						</TooltipTrigger>
						<TooltipContent side="bottom">
							Back to {worktreePath?.split("/").pop()}
						</TooltipContent>
					</Tooltip>
					<LuChevronRight className="size-3 shrink-0 text-muted-foreground/50" />
					{breadcrumbSegments.map((segment, i) => (
						<span key={segment.path} className="flex items-center gap-0.5">
							{i > 0 && (
								<LuChevronRight className="size-3 shrink-0 text-muted-foreground/50" />
							)}
							<button
								type="button"
								onClick={() => setBrowseRoot(segment.path)}
								className={cn(
									"shrink-0 truncate max-w-[120px] hover:text-foreground transition-colors",
									i === breadcrumbSegments.length - 1 && "text-foreground",
								)}
							>
								{segment.name}
							</button>
						</span>
					))}
				</div>
			)}

			<div className="flex-1 min-h-0 overflow-hidden">
				<ContextMenu>
					<ContextMenuTrigger asChild className="h-full">
						<div className="h-full overflow-auto">
							{newItemMode &&
								newItemParentPath === (effectiveRoot ?? worktreePath) && (
									<NewItemInput
										mode={newItemMode}
										parentPath={newItemParentPath}
										onSubmit={handleNewItemSubmit}
										onCancel={handleNewItemCancel}
									/>
								)}

							{isSearching ? (
								searchResultEntries.length > 0 ? (
									<div className="flex flex-col">
										{searchResultEntries.map((entry) =>
											renameEntry?.path === entry.path ? (
												<RenameInput
													key={entry.id}
													entry={entry}
													onSubmit={handleRenameSubmit}
													onCancel={handleRenameCancel}
												/>
											) : (
												<FileSearchResultItem
													key={entry.id}
													entry={entry}
													worktreePath={effectiveRoot ?? worktreePath}
													projectId={projectId}
													onActivate={handleFileActivate}
													onOpenInEditor={handleOpenInEditor}
													onNewFile={handleNewFile}
													onNewFolder={handleNewFolder}
													onRename={handleRename}
													onDelete={handleDeleteRequest}
												/>
											),
										)}
									</div>
								) : (
									<div className="flex-1 flex items-center justify-center text-muted-foreground text-sm p-4">
										{isSearchFetching
											? "Searching files..."
											: "No matching files"}
									</div>
								)
							) : (
								<div {...tree.getContainerProps()} className="outline-none">
									{tree.getItems().map((item: ItemInstance<DirectoryEntry>) => {
										const data = item.getItemData();
										if (!data || item.getId() === "root") return null;
										const showNewItemInput =
											newItemMode &&
											data.isDirectory &&
											data.path === newItemParentPath;
										const isRenaming = renameEntry?.path === data.path;
										return (
											<div key={item.getId()}>
												{isRenaming ? (
													<RenameInput
														entry={data}
														onSubmit={handleRenameSubmit}
														onCancel={handleRenameCancel}
														level={item.getItemMeta().level}
													/>
												) : (
													<FileTreeItem
														item={item}
														entry={data}
														rowHeight={ROW_HEIGHT}
														indent={TREE_INDENT}
														worktreePath={effectiveRoot ?? worktreePath}
														projectId={projectId}
														onActivate={handleFileActivate}
														onOpenInEditor={handleOpenInEditor}
														onNewFile={handleNewFile}
														onNewFolder={handleNewFolder}
														onRename={handleRename}
														onDelete={handleDeleteRequest}
													/>
												)}
												{showNewItemInput && (
													<NewItemInput
														mode={newItemMode}
														parentPath={newItemParentPath}
														onSubmit={handleNewItemSubmit}
														onCancel={handleNewItemCancel}
														level={item.getItemMeta().level + 1}
													/>
												)}
											</div>
										);
									})}
								</div>
							)}
						</div>
					</ContextMenuTrigger>
					<ContextMenuContent className="w-48">
						<ContextMenuItem
							onClick={() => handleNewFile(effectiveRoot ?? worktreePath)}
						>
							<LuFile className="mr-2 size-4" />
							New File
						</ContextMenuItem>
						<ContextMenuItem
							onClick={() => handleNewFolder(effectiveRoot ?? worktreePath)}
						>
							<LuFolder className="mr-2 size-4" />
							New Folder
						</ContextMenuItem>
					</ContextMenuContent>
				</ContextMenu>
			</div>

			<DeleteConfirmDialog
				entry={deleteEntry}
				open={showDeleteDialog}
				onOpenChange={setShowDeleteDialog}
				onConfirm={handleDeleteConfirm}
				isDeleting={isDeleting}
			/>
		</div>
	);
}
