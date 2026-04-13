import type { AppRouter } from "@superset/host-service";
import type { ExternalApp } from "@superset/local-db";
import { alert } from "@superset/ui/atoms/Alert";
import { Button } from "@superset/ui/button";
import { toast } from "@superset/ui/sonner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { workspaceTrpc } from "@superset/workspace-client";
import { eq } from "@tanstack/db";
import { useLiveQuery } from "@tanstack/react-db";
import type { inferRouterOutputs } from "@trpc/server";
import { FilePlus, FolderPlus, FoldVertical, RefreshCw } from "lucide-react";
import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import {
	type FileTreeNode,
	useFileTree,
} from "renderer/hooks/host-service/useFileTree";
import {
	type FileStatus,
	useGitStatusMap,
} from "renderer/hooks/host-service/useGitStatusMap";
import { useWorkspaceEvent } from "renderer/hooks/host-service/useWorkspaceEvent";
import { electronTrpcClient } from "renderer/lib/trpc-client";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";
import {
	ROW_HEIGHT,
	TREE_INDENT,
} from "renderer/screens/main/components/WorkspaceView/RightSidebar/FilesView/constants";
import { NewItemInput } from "./components/NewItemInput";
import { WorkspaceFilesTreeItem } from "./components/WorkspaceFilesTreeItem";

type GitStatusData = inferRouterOutputs<AppRouter>["git"]["getStatus"];

type InlineEditState =
	| { kind: "create"; mode: "file" | "folder"; parentPath: string }
	| { kind: "rename"; absolutePath: string; name: string; isDirectory: boolean }
	| null;

interface FilesTabProps {
	onSelectFile: (absolutePath: string, openInNewTab?: boolean) => void;
	selectedFilePath?: string;
	workspaceId: string;
	workspaceName?: string;
	gitStatus: GitStatusData | undefined;
}

function toPosix(path: string): string {
	return path.replace(/\\/g, "/");
}

function TreeNode({
	node,
	depth,
	indent,
	rowHeight,
	selectedFilePath,
	hoveredPath,
	inlineEdit,
	isMuted,
	fileStatusByPath,
	folderStatusByPath,
	ignoredPaths,
	onSelectFile,
	onOpenInEditor,
	onToggleDirectory,
	onInlineEditSubmit,
	onInlineEditCancel,
	onNewFile,
	onNewFolder,
	onRename,
	onDelete,
}: {
	node: FileTreeNode;
	depth: number;
	indent: number;
	rowHeight: number;
	selectedFilePath?: string;
	hoveredPath?: string | null;
	inlineEdit: InlineEditState;
	isMuted: boolean;
	fileStatusByPath: Map<string, FileStatus>;
	folderStatusByPath: Map<string, FileStatus>;
	ignoredPaths: Set<string>;
	onSelectFile: (absolutePath: string, openInNewTab?: boolean) => void;
	onOpenInEditor: (absolutePath: string) => void;
	onToggleDirectory: (absolutePath: string) => void;
	onInlineEditSubmit: (name: string) => void;
	onInlineEditCancel: () => void;
	onNewFile: (parentPath: string) => void;
	onNewFolder: (parentPath: string) => void;
	onRename: (absolutePath: string, name: string, isDirectory: boolean) => void;
	onDelete: (absolutePath: string, name: string, isDirectory: boolean) => void;
}) {
	const isCreating = inlineEdit?.kind === "create";
	const isCreatingHere =
		isCreating && inlineEdit.parentPath === node.absolutePath;
	const isCreatingFile = isCreatingHere && inlineEdit.mode === "file";
	const isRenaming =
		inlineEdit?.kind === "rename" &&
		inlineEdit.absolutePath === node.absolutePath;
	const lastFolderIndex = node.children.findLastIndex(
		(n) => n.kind === "directory",
	);

	// Resolve decoration once per node. Muted wins over change status so
	// gitignored paths stay quiet even in the `git add -f` edge case.
	const posixRelativePath = toPosix(node.relativePath);
	const isFolder = node.kind === "directory";
	const fileStatus = !isFolder
		? fileStatusByPath.get(posixRelativePath)
		: undefined;
	const folderStatus = isFolder
		? folderStatusByPath.get(posixRelativePath)
		: undefined;
	const decoration = isMuted ? undefined : (fileStatus ?? folderStatus);

	return (
		<div>
			{isRenaming ? (
				<NewItemInput
					mode={node.kind === "directory" ? "folder" : "file"}
					depth={depth}
					initialValue={inlineEdit.name}
					onSubmit={onInlineEditSubmit}
					onCancel={onInlineEditCancel}
				/>
			) : (
				<WorkspaceFilesTreeItem
					node={node}
					depth={depth}
					indent={indent}
					rowHeight={rowHeight}
					selectedFilePath={selectedFilePath}
					isHovered={hoveredPath === node.absolutePath}
					decoration={decoration}
					isMuted={isMuted}
					onSelectFile={onSelectFile}
					onOpenInEditor={onOpenInEditor}
					onToggleDirectory={onToggleDirectory}
					onNewFile={onNewFile}
					onNewFolder={onNewFolder}
					onRename={onRename}
					onDelete={onDelete}
				/>
			)}
			{node.kind === "directory" && node.isExpanded && (
				<>
					{isCreatingHere && inlineEdit.mode === "folder" && (
						<NewItemInput
							mode="folder"
							depth={depth + 1}
							onSubmit={onInlineEditSubmit}
							onCancel={onInlineEditCancel}
						/>
					)}
					{node.children.map((child, index) => {
						const childIsMuted =
							isMuted || ignoredPaths.has(toPosix(child.relativePath));
						return (
							<Fragment key={child.absolutePath}>
								<TreeNode
									node={child}
									depth={depth + 1}
									indent={indent}
									rowHeight={rowHeight}
									selectedFilePath={selectedFilePath}
									hoveredPath={hoveredPath}
									inlineEdit={inlineEdit}
									isMuted={childIsMuted}
									fileStatusByPath={fileStatusByPath}
									folderStatusByPath={folderStatusByPath}
									ignoredPaths={ignoredPaths}
									onSelectFile={onSelectFile}
									onOpenInEditor={onOpenInEditor}
									onToggleDirectory={onToggleDirectory}
									onInlineEditSubmit={onInlineEditSubmit}
									onInlineEditCancel={onInlineEditCancel}
									onNewFile={onNewFile}
									onNewFolder={onNewFolder}
									onRename={onRename}
									onDelete={onDelete}
								/>
								{isCreatingFile && index === lastFolderIndex && (
									<NewItemInput
										mode="file"
										depth={depth + 1}
										onSubmit={onInlineEditSubmit}
										onCancel={onInlineEditCancel}
									/>
								)}
							</Fragment>
						);
					})}
					{isCreatingFile && lastFolderIndex === -1 && (
						<NewItemInput
							mode="file"
							depth={depth + 1}
							onSubmit={onInlineEditSubmit}
							onCancel={onInlineEditCancel}
						/>
					)}
				</>
			)}
		</div>
	);
}

export function FilesTab({
	onSelectFile,
	selectedFilePath,
	workspaceId,
	workspaceName,
	gitStatus,
}: FilesTabProps) {
	const [_isRefreshing, setIsRefreshing] = useState(false);
	const [hoveredPath, setHoveredPath] = useState<string | null>(null);
	const [inlineEdit, setInlineEdit] = useState<InlineEditState>(null);
	const utils = workspaceTrpc.useUtils();
	const workspaceQuery = workspaceTrpc.workspace.get.useQuery({
		id: workspaceId,
	});
	const rootPath = workspaceQuery.data?.worktreePath ?? "";
	const projectId = workspaceQuery.data?.projectId;

	const collections = useCollections();
	const { machineId } = useLocalHostService();
	const { data: workspacesWithHost = [] } = useLiveQuery(
		(q) =>
			q
				.from({ workspaces: collections.v2Workspaces })
				.leftJoin({ hosts: collections.v2Hosts }, ({ workspaces, hosts }) =>
					eq(workspaces.hostId, hosts.id),
				)
				.where(({ workspaces }) => eq(workspaces.id, workspaceId))
				.select(({ hosts }) => ({
					hostMachineId: hosts?.machineId ?? null,
				})),
		[collections, workspaceId],
	);
	const workspaceHost = workspacesWithHost[0];

	const { data: sidebarProjectRows = [] } = useLiveQuery(
		(q) =>
			q
				.from({ sp: collections.v2SidebarProjects })
				.where(({ sp }) => eq(sp.projectId, projectId ?? ""))
				.select(({ sp }) => ({ defaultOpenInApp: sp.defaultOpenInApp })),
		[collections, projectId],
	);
	const resolvedOpenInApp: ExternalApp =
		(sidebarProjectRows[0]?.defaultOpenInApp as ExternalApp | null) ?? "finder";

	const handleOpenInEditor = useCallback(
		(absolutePath: string) => {
			if (!workspaceHost) return;
			if (workspaceHost.hostMachineId !== machineId) {
				toast.error("Opening in editor is only supported on local workspaces");
				return;
			}
			electronTrpcClient.external.openInApp
				.mutate({ path: absolutePath, app: resolvedOpenInApp })
				.catch((err) => {
					toast.error("Couldn't open file", {
						description: err instanceof Error ? err.message : String(err),
					});
				});
		},
		[workspaceHost, machineId, resolvedOpenInApp],
	);

	const writeFile = workspaceTrpc.filesystem.writeFile.useMutation();
	const createDirectory =
		workspaceTrpc.filesystem.createDirectory.useMutation();
	const movePath = workspaceTrpc.filesystem.movePath.useMutation();

	const fileTree = useFileTree({ workspaceId, rootPath });

	const { fileStatusByPath, folderStatusByPath, ignoredPaths } =
		useGitStatusMap(gitStatus);

	useWorkspaceEvent(
		"fs:events",
		workspaceId,
		() => void utils.filesystem.searchFiles.invalidate(),
		Boolean(workspaceId),
	);

	const scrollContainerRef = useRef<HTMLDivElement>(null);
	const lastMousePos = useRef<{ x: number; y: number } | null>(null);
	const prevSelectedRef = useRef(selectedFilePath);

	const updateHoverFromPoint = useCallback((x: number, y: number) => {
		const el = document.elementFromPoint(x, y)?.closest("[data-filepath]");
		setHoveredPath(el?.getAttribute("data-filepath") ?? null);
	}, []);

	const handleMouseMove = useCallback(
		(e: React.MouseEvent) => {
			lastMousePos.current = { x: e.clientX, y: e.clientY };
			updateHoverFromPoint(e.clientX, e.clientY);
		},
		[updateHoverFromPoint],
	);

	const handleScroll = useCallback(() => {
		if (lastMousePos.current)
			updateHoverFromPoint(lastMousePos.current.x, lastMousePos.current.y);
	}, [updateHoverFromPoint]);

	const handleMouseLeave = useCallback(() => {
		lastMousePos.current = null;
		setHoveredPath(null);
	}, []);

	useEffect(() => {
		if (
			selectedFilePath &&
			selectedFilePath !== prevSelectedRef.current &&
			rootPath
		) {
			void fileTree.reveal(selectedFilePath).then(() => {
				requestAnimationFrame(() => {
					scrollContainerRef.current
						?.querySelector(`[data-filepath="${CSS.escape(selectedFilePath)}"]`)
						?.scrollIntoView({ block: "center" });
				});
			});
		}
		prevSelectedRef.current = selectedFilePath;
	}, [selectedFilePath, rootPath, fileTree]);

	const handleRefresh = useCallback(async () => {
		setIsRefreshing(true);
		try {
			await fileTree.refreshAll();
		} finally {
			setIsRefreshing(false);
		}
	}, [fileTree]);

	const getParentForCreation = useCallback((): string => {
		if (!selectedFilePath || !rootPath) return rootPath;
		// Walk tree to check if selected is a directory
		function isDirectory(nodes: FileTreeNode[]): boolean {
			for (const n of nodes) {
				if (n.absolutePath === selectedFilePath) return n.kind === "directory";
				if (n.children.length > 0 && isDirectory(n.children)) return true;
			}
			return false;
		}
		if (isDirectory(fileTree.rootEntries)) return selectedFilePath;
		const lastSlash = selectedFilePath.lastIndexOf("/");
		return lastSlash > 0 ? selectedFilePath.slice(0, lastSlash) : rootPath;
	}, [selectedFilePath, rootPath, fileTree.rootEntries]);

	const startCreating = useCallback(
		async (mode: "file" | "folder", targetPath?: string) => {
			const parentPath = targetPath ?? getParentForCreation();
			if (parentPath !== rootPath) await fileTree.expand(parentPath);
			setInlineEdit({ kind: "create", mode, parentPath });

			scrollContainerRef.current
				?.querySelector("[data-new-item-input]")
				?.scrollIntoView({ block: "nearest" });
			setTimeout(() => {
				scrollContainerRef.current
					?.querySelector<HTMLInputElement>("[data-new-item-input] input")
					?.focus();
			}, 200);
		},
		[getParentForCreation, rootPath, fileTree],
	);

	const startRenaming = useCallback(
		(absolutePath: string, name: string, isDirectory: boolean) => {
			setInlineEdit({ kind: "rename", absolutePath, name, isDirectory });
			setTimeout(() => {
				scrollContainerRef.current
					?.querySelector<HTMLInputElement>("[data-new-item-input] input")
					?.focus();
			}, 200);
		},
		[],
	);

	const handleInlineEditSubmit = useCallback(
		async (name: string) => {
			if (!inlineEdit || !rootPath) return;

			try {
				if (inlineEdit.kind === "create") {
					const { mode, parentPath } = inlineEdit;
					const segments = name.split("/").filter(Boolean);
					if (segments.length === 0) return;

					const absolutePath = `${parentPath}/${name}`;

					if (mode === "folder") {
						await createDirectory.mutateAsync({
							workspaceId,
							absolutePath,
							recursive: true,
						});
					} else {
						if (segments.length > 1) {
							const dirPath = `${parentPath}/${segments.slice(0, -1).join("/")}`;
							await createDirectory.mutateAsync({
								workspaceId,
								absolutePath: dirPath,
								recursive: true,
							});
						}
						await writeFile.mutateAsync({
							workspaceId,
							absolutePath,
							content: "",
							options: { create: true, overwrite: false },
						});
						onSelectFile(absolutePath);
					}
				} else {
					const { absolutePath } = inlineEdit;
					const parentDir = absolutePath.slice(
						0,
						absolutePath.lastIndexOf("/"),
					);
					const destinationPath = `${parentDir}/${name}`;
					await movePath.mutateAsync({
						workspaceId,
						sourceAbsolutePath: absolutePath,
						destinationAbsolutePath: destinationPath,
					});
				}
			} catch (error) {
				toast.error(
					inlineEdit.kind === "create"
						? "Failed to create item"
						: "Failed to rename",
					{
						description: error instanceof Error ? error.message : undefined,
					},
				);
			}
			setInlineEdit(null);
		},
		[
			inlineEdit,
			rootPath,
			workspaceId,
			writeFile,
			createDirectory,
			movePath,
			onSelectFile,
		],
	);

	const handleInlineEditCancel = useCallback(() => setInlineEdit(null), []);

	const deletePath = workspaceTrpc.filesystem.deletePath.useMutation();

	const handleDelete = useCallback(
		(absolutePath: string, name: string, isDirectory: boolean) => {
			const itemType = isDirectory ? "folder" : "file";
			alert({
				title: `Delete ${name}?`,
				description: `Are you sure you want to delete this ${itemType}? This action cannot be undone.`,
				actions: [
					{
						label: "Delete",
						variant: "destructive",
						onClick: () => {
							toast.promise(
								deletePath.mutateAsync({
									workspaceId,
									absolutePath,
								}),
								{
									loading: `Deleting ${name}...`,
									success: `Deleted ${name}`,
									error: `Failed to delete ${name}`,
								},
							);
						},
					},
					{
						label: "Cancel",
						variant: "ghost",
					},
				],
			});
		},
		[workspaceId, deletePath],
	);

	if (!workspaceQuery.data?.worktreePath) {
		return (
			<div className="flex h-full items-center justify-center text-sm text-muted-foreground">
				Workspace worktree not available
			</div>
		);
	}

	const isCreatingAtRoot =
		inlineEdit?.kind === "create" && inlineEdit.parentPath === rootPath;
	const isCreatingFileAtRoot =
		isCreatingAtRoot &&
		inlineEdit?.kind === "create" &&
		inlineEdit.mode === "file";
	const isCreatingFolderAtRoot =
		isCreatingAtRoot &&
		inlineEdit?.kind === "create" &&
		inlineEdit.mode === "folder";
	const rootLastFolderIndex = fileTree.rootEntries.findLastIndex(
		(n) => n.kind === "directory",
	);

	return (
		<div className="flex h-full min-h-0 flex-col overflow-hidden">
			{/* biome-ignore lint/a11y/noStaticElementInteractions: mouse tracking for hover state */}
			<div
				ref={scrollContainerRef}
				className="min-h-0 flex-1 overflow-y-auto"
				onMouseMove={handleMouseMove}
				onMouseLeave={handleMouseLeave}
				onScroll={handleScroll}
			>
				<div
					className="group flex items-center justify-between bg-background px-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground"
					style={{
						height: ROW_HEIGHT,
						position: "sticky",
						top: 0,
						zIndex: 20,
					}}
				>
					<span className="truncate">{workspaceName ?? "Explorer"}</span>
					<div className="flex items-center gap-0.5">
						<Tooltip>
							<TooltipTrigger asChild>
								<Button
									variant="ghost"
									size="icon"
									className="size-5"
									onClick={() => void startCreating("file")}
								>
									<FilePlus className="size-3" />
								</Button>
							</TooltipTrigger>
							<TooltipContent side="bottom">New File</TooltipContent>
						</Tooltip>
						<Tooltip>
							<TooltipTrigger asChild>
								<Button
									variant="ghost"
									size="icon"
									className="size-5"
									onClick={() => void startCreating("folder")}
								>
									<FolderPlus className="size-3" />
								</Button>
							</TooltipTrigger>
							<TooltipContent side="bottom">New Folder</TooltipContent>
						</Tooltip>
						<Tooltip>
							<TooltipTrigger asChild>
								<Button
									variant="ghost"
									size="icon"
									className="size-5"
									onClick={() => void handleRefresh()}
								>
									<RefreshCw className="size-3" />
								</Button>
							</TooltipTrigger>
							<TooltipContent side="bottom">Refresh</TooltipContent>
						</Tooltip>
						<Tooltip>
							<TooltipTrigger asChild>
								<Button
									variant="ghost"
									size="icon"
									className="size-5"
									onClick={fileTree.collapseAll}
								>
									<FoldVertical className="size-3" />
								</Button>
							</TooltipTrigger>
							<TooltipContent side="bottom">Collapse All</TooltipContent>
						</Tooltip>
					</div>
				</div>

				{fileTree.rootEntries.length === 0 &&
				!fileTree.isLoadingRoot &&
				!isCreatingAtRoot ? (
					<div className="px-2 py-3 text-sm text-muted-foreground">
						No files found
					</div>
				) : (
					<>
						{isCreatingFolderAtRoot && (
							<NewItemInput
								mode="folder"
								depth={1}
								onSubmit={handleInlineEditSubmit}
								onCancel={handleInlineEditCancel}
							/>
						)}
						{fileTree.rootEntries.map((node, index) => {
							const nodeIsMuted = ignoredPaths.has(toPosix(node.relativePath));
							return (
								<Fragment key={node.absolutePath}>
									<TreeNode
										node={node}
										depth={1}
										indent={TREE_INDENT}
										rowHeight={ROW_HEIGHT}
										selectedFilePath={selectedFilePath}
										hoveredPath={hoveredPath}
										inlineEdit={inlineEdit}
										isMuted={nodeIsMuted}
										fileStatusByPath={fileStatusByPath}
										folderStatusByPath={folderStatusByPath}
										ignoredPaths={ignoredPaths}
										onSelectFile={onSelectFile}
										onOpenInEditor={handleOpenInEditor}
										onToggleDirectory={(absolutePath) =>
											void fileTree.toggle(absolutePath)
										}
										onInlineEditSubmit={handleInlineEditSubmit}
										onInlineEditCancel={handleInlineEditCancel}
										onNewFile={(parentPath) =>
											void startCreating("file", parentPath)
										}
										onNewFolder={(parentPath) =>
											void startCreating("folder", parentPath)
										}
										onRename={(absolutePath, name, isDirectory) =>
											startRenaming(absolutePath, name, isDirectory)
										}
										onDelete={handleDelete}
									/>
									{isCreatingFileAtRoot && index === rootLastFolderIndex && (
										<NewItemInput
											mode="file"
											depth={1}
											onSubmit={handleInlineEditSubmit}
											onCancel={handleInlineEditCancel}
										/>
									)}
								</Fragment>
							);
						})}
						{isCreatingFileAtRoot && rootLastFolderIndex === -1 && (
							<NewItemInput
								mode="file"
								depth={1}
								onSubmit={handleInlineEditSubmit}
								onCancel={handleInlineEditCancel}
							/>
						)}
					</>
				)}
			</div>
		</div>
	);
}
