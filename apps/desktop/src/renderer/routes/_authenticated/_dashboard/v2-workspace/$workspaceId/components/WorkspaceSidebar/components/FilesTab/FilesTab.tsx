import type {
	FileTreeRenameEvent,
	ContextMenuItem as PierreContextMenuItem,
	ContextMenuOpenContext as PierreContextMenuOpenContext,
} from "@pierre/trees";
import {
	FileTree as PierreFileTree,
	useFileTree as usePierreFileTree,
} from "@pierre/trees/react";
import type { AppRouter } from "@superset/host-service";
import { alert } from "@superset/ui/atoms/Alert";
import { Button } from "@superset/ui/button";
import { toast } from "@superset/ui/sonner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { workspaceTrpc } from "@superset/workspace-client";
import type { inferRouterOutputs } from "@trpc/server";
import {
	FilePlus,
	FolderPlus,
	FoldVertical,
	Loader2,
	RefreshCw,
} from "lucide-react";
import { useCallback, useEffect, useRef } from "react";
import type { FileStatus } from "renderer/hooks/host-service/useGitStatusMap";
import { useGitStatusMap } from "renderer/hooks/host-service/useGitStatusMap";
import { useOpenInExternalEditor } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/useOpenInExternalEditor";
import {
	OVERSCAN_COUNT,
	ROW_HEIGHT,
	TREE_INDENT,
} from "renderer/screens/main/components/WorkspaceView/RightSidebar/FilesView/constants";
import { FileMenuItems } from "./components/FileMenuItems";
import { FolderMenuItems } from "./components/FolderMenuItems";
import { RowContextMenu } from "./components/RowContextMenu";
import { useFilesTabBridge } from "./hooks/useFilesTabBridge";
import { loadFallthroughIcons } from "./utils/loadFallthroughIcons";
import {
	asDirectoryHandle,
	basename,
	parentRel,
	stripTrailingSlash,
	toAbs,
	toRel,
} from "./utils/treePath";

// Map Pierre's --trees-* CSS variables to our shadcn tokens so the file tree
// inherits app theme (light/dark) automatically. Pierre falls back through
// `*-override → theme tokens → defaults`, so providing overrides is enough —
// no need to touch the theme tier. Custom properties cascade through Pierre's
// shadow DOM, so setting them on the host element is sufficient.
const TREE_STYLE: React.CSSProperties = {
	// Layout
	"--trees-row-height-override": `${ROW_HEIGHT}px`,
	"--trees-level-gap-override": `${TREE_INDENT}px`,
	"--trees-padding-inline-override": "8px",
	"--trees-border-radius-override": "0",

	// Surface
	"--trees-bg-override": "var(--background)",
	"--trees-fg-override": "var(--foreground)",
	"--trees-fg-muted-override": "var(--muted-foreground)",
	"--trees-bg-muted-override": "var(--muted)",
	"--trees-accent-override": "var(--accent)",
	"--trees-border-color-override": "var(--border)",

	// Selected row matches v2's `bg-accent`/`text-accent-foreground` rows
	"--trees-selected-bg-override": "var(--accent)",
	"--trees-selected-fg-override": "var(--accent-foreground)",
	"--trees-selected-focused-border-color-override": "var(--ring)",

	// Search bar matches our text input chrome
	"--trees-search-bg-override": "var(--input, var(--background))",
	"--trees-search-fg-override": "var(--foreground)",

	// Focus ring
	"--trees-focus-ring-color-override": "var(--ring)",
	"--trees-focus-ring-offset-override": "0px",

	// Git status row tint — matches the Tailwind palette v1 used (green / yellow
	// / red / blue) so a 'modified' file in the tree reads the same color as a
	// 'modified' badge elsewhere in the v2 chrome.
	"--trees-status-added-override": "oklch(0.627 0.194 149.214)",
	"--trees-status-untracked-override": "oklch(0.627 0.194 149.214)",
	"--trees-status-modified-override": "oklch(0.681 0.162 75.834)",
	"--trees-status-deleted-override": "oklch(0.577 0.245 27.325)",
	"--trees-status-renamed-override": "oklch(0.6 0.118 244.557)",
	"--trees-status-ignored-override": "var(--muted-foreground)",

	fontSize: "0.75rem",
} as React.CSSProperties;

type GitStatusData = inferRouterOutputs<AppRouter>["git"]["getStatus"];

interface FilesTabProps {
	onSelectFile: (absolutePath: string, openInNewTab?: boolean) => void;
	selectedFilePath?: string;
	pendingReveal?: {
		path: string;
		isDirectory: boolean;
	} | null;
	workspaceId: string;
	gitStatus: GitStatusData | undefined;
}

// Map our richer FileStatus into Pierre's narrower GitStatus enum.
// 'changed' (binary modify) → modified; 'copied' → added (no native equivalent).
const PIERRE_GIT_STATUS: Record<
	FileStatus,
	"added" | "deleted" | "modified" | "renamed" | "untracked"
> = {
	added: "added",
	changed: "modified",
	copied: "added",
	deleted: "deleted",
	modified: "modified",
	renamed: "renamed",
	untracked: "untracked",
};

export function FilesTab({
	onSelectFile,
	selectedFilePath,
	pendingReveal,
	workspaceId,
	gitStatus,
}: FilesTabProps) {
	const workspaceQuery = workspaceTrpc.workspace.get.useQuery({
		id: workspaceId,
	});
	const rootPath = workspaceQuery.data?.worktreePath ?? "";

	const openInExternalEditor = useOpenInExternalEditor(workspaceId);
	const writeFile = workspaceTrpc.filesystem.writeFile.useMutation();
	const createDirectory =
		workspaceTrpc.filesystem.createDirectory.useMutation();
	const movePath = workspaceTrpc.filesystem.movePath.useMutation();
	const deletePath = workspaceTrpc.filesystem.deletePath.useMutation();

	const { fileStatusByPath, ignoredPaths } = useGitStatusMap(gitStatus);

	// Pierre's `gitStatus` is consumed only at construction; live updates
	// flow via model.setGitStatus in an effect below.
	const initialGitStatusEntriesRef = useRef(
		buildPierreGitStatus(fileStatusByPath, ignoredPaths),
	);

	// Selection feedback loop guard: when the parent re-renders after we
	// fired onSelectFile, syncing selectedFilePath back into the model would
	// retrigger our onSelectionChange. Skip the next selection echo.
	const lastSelectedFromUserRef = useRef<string | null>(null);

	// `useFileTree` constructs the model once and never re-reads its options,
	// so any callback we pass directly would close over stale state. Route
	// every callback through a ref so we can update it on each render while
	// keeping a stable function identity for Pierre.
	const handlersRef = useRef({
		onSelect(_path: string) {},
		onRename(_event: FileTreeRenameEvent) {},
	});

	const { model } = usePierreFileTree({
		paths: [],
		initialExpansion: "closed",
		search: false,
		renaming: {
			onRename: (event) => handlersRef.current.onRename(event),
			onError: (message) => toast.error(message),
		},
		gitStatus: initialGitStatusEntriesRef.current,
		icons: { set: "complete", colored: true },
		itemHeight: ROW_HEIGHT,
		overscan: OVERSCAN_COUNT,
		stickyFolders: true,
		onSelectionChange: (paths) => {
			const last = paths[paths.length - 1];
			if (!last) return;
			// Pierre uses trailing-slash paths for directories; we only fire
			// onSelectFile for files (clicking a folder toggles expansion).
			if (last.endsWith("/")) return;
			handlersRef.current.onSelect(last);
		},
	});

	const bridge = useFilesTabBridge({ model, workspaceId, rootPath });

	// Push live git status updates into Pierre.
	useEffect(() => {
		model.setGitStatus(buildPierreGitStatus(fileStatusByPath, ignoredPaths));
	}, [model, fileStatusByPath, ignoredPaths]);

	// Layer our Material-icon coverage on top of Pierre's built-ins for file
	// types Pierre doesn't recognize (`.toml`, `.lock`, framework dirs, etc).
	// Initial render uses Pierre's defaults; ours fill in once the sprite
	// finishes loading. The cache inside loadFallthroughIcons makes subsequent
	// mounts a no-op.
	useEffect(() => {
		let cancelled = false;
		void loadFallthroughIcons().then(
			({ spriteSheet, byFileName, byFileExtension }) => {
				if (cancelled) return;
				model.setIcons({
					set: "complete",
					colored: true,
					spriteSheet,
					byFileName,
					byFileExtension,
				});
			},
		);
		return () => {
			cancelled = true;
		};
	}, [model]);

	// Reflect external selection changes (e.g. tab switch) back into the model.
	useEffect(() => {
		if (!selectedFilePath || !rootPath) return;
		if (lastSelectedFromUserRef.current === selectedFilePath) {
			lastSelectedFromUserRef.current = null;
			return;
		}
		const rel = toRel(rootPath, selectedFilePath);
		if (!bridge.knownPaths.has(rel)) return;
		model.focusPath(rel);
	}, [model, selectedFilePath, rootPath, bridge.knownPaths]);

	// Reveal a path: ensure all ancestor directories are expanded so the row
	// is visible, then scroll it into view.
	const reveal = useCallback(
		async (absolutePath: string, isDirectory: boolean): Promise<void> => {
			if (!rootPath || !absolutePath.startsWith(rootPath)) return;
			const rel = toRel(rootPath, absolutePath);
			if (!rel) return;

			const segments = rel.split("/");
			let acc = "";
			for (let i = 0; i < segments.length - 1; i++) {
				acc = acc ? `${acc}/${segments[i]}` : segments[i];
				const dirKey = `${acc}/`;
				if (!bridge.knownPaths.has(dirKey)) {
					// Ancestor not loaded yet — load its parent then expand.
					await bridge.fetchDir(parentRel(acc));
				}
				const handle = asDirectoryHandle(model.getItem(dirKey));
				if (handle && !handle.isExpanded()) {
					handle.expand();
					await bridge.fetchDir(acc);
				}
			}
			if (isDirectory) {
				const dirKey = `${rel}/`;
				const handle = asDirectoryHandle(model.getItem(dirKey));
				if (handle && !handle.isExpanded()) {
					handle.expand();
					await bridge.fetchDir(rel);
				}
			}

			requestAnimationFrame(() => {
				model.focusPath(rel);
			});
		},
		[model, rootPath, bridge.fetchDir, bridge.knownPaths],
	);

	useEffect(() => {
		if (!pendingReveal || !rootPath) return;
		void reveal(pendingReveal.path, pendingReveal.isDirectory);
	}, [pendingReveal, rootPath, reveal]);

	const startCreating = useCallback(
		async (mode: "file" | "folder", parentAbs?: string): Promise<void> => {
			if (!rootPath) return;
			const parentAbsPath =
				parentAbs ??
				deriveCreationParent(selectedFilePath, bridge.knownPaths, rootPath);
			const parentRelPath = toRel(rootPath, parentAbsPath);
			const parentDirKey = parentRelPath ? `${parentRelPath}/` : "";

			// Make sure Pierre has the parent's children loaded + expanded so
			// the placeholder row appears in the right place.
			if (parentRelPath) {
				await bridge.fetchDir(parentRelPath);
				const handle = asDirectoryHandle(model.getItem(parentDirKey));
				if (handle && !handle.isExpanded()) {
					handle.expand();
				}
			}

			const placeholderName = pickPlaceholderName(
				parentRelPath,
				mode,
				bridge.knownPaths,
			);
			const placeholderPath =
				(parentRelPath ? `${parentRelPath}/` : "") +
				placeholderName +
				(mode === "folder" ? "/" : "");

			bridge.pendingCreates.set(placeholderPath, mode);
			bridge.knownPaths.add(placeholderPath);
			model.add(placeholderPath);
			// removeIfCanceled cleans up the placeholder if user hits Esc.
			model.startRenaming(placeholderPath, { removeIfCanceled: true });
		},
		[model, rootPath, selectedFilePath, bridge],
	);

	const handleRename = useCallback(
		async (event: FileTreeRenameEvent): Promise<void> => {
			if (!rootPath) return;
			const { sourcePath, destinationPath, isFolder } = event;
			const pendingMode = bridge.pendingCreates.get(sourcePath);

			if (pendingMode) {
				bridge.pendingCreates.delete(sourcePath);
				// Pierre has already moved placeholder → destinationPath in
				// its tree; sync our knownPaths so we don't double-account.
				bridge.knownPaths.delete(sourcePath);
				bridge.knownPaths.add(destinationPath);
				const absPath = toAbs(rootPath, destinationPath);
				try {
					if (pendingMode === "folder") {
						await createDirectory.mutateAsync({
							workspaceId,
							absolutePath: absPath,
							recursive: true,
						});
					} else {
						const segments = stripTrailingSlash(
							basename(destinationPath),
						).split("/");
						if (segments.length === 0) return;
						await writeFile.mutateAsync({
							workspaceId,
							absolutePath: absPath,
							content: "",
							options: { create: true, overwrite: false },
						});
						onSelectFile(absPath);
					}
				} catch (error) {
					bridge.knownPaths.delete(destinationPath);
					try {
						model.remove(destinationPath, { recursive: true });
					} catch {
						// ignore
					}
					toast.error("Failed to create item", {
						description: error instanceof Error ? error.message : undefined,
					});
				}
				return;
			}

			// Genuine rename.
			bridge.knownPaths.delete(sourcePath);
			bridge.knownPaths.add(destinationPath);
			if (isFolder) {
				bridge.loadedDirs.delete(stripTrailingSlash(sourcePath));
			}
			try {
				await movePath.mutateAsync({
					workspaceId,
					sourceAbsolutePath: toAbs(rootPath, sourcePath),
					destinationAbsolutePath: toAbs(rootPath, destinationPath),
				});
			} catch (error) {
				// Revert Pierre's optimistic rename.
				try {
					model.move(destinationPath, sourcePath);
					bridge.knownPaths.delete(destinationPath);
					bridge.knownPaths.add(sourcePath);
				} catch {
					// ignore — fs:events will reconcile
				}
				toast.error("Failed to rename", {
					description: error instanceof Error ? error.message : undefined,
				});
			}
		},
		[
			model,
			rootPath,
			workspaceId,
			createDirectory,
			writeFile,
			movePath,
			onSelectFile,
			bridge,
		],
	);

	// Wire the ref-based handlers so Pierre's stable callbacks always reach
	// the latest closures. Updated on every render — no diffing needed.
	handlersRef.current.onRename = (event) => void handleRename(event);
	handlersRef.current.onSelect = (treePath) => {
		const abs = toAbs(rootPath, treePath);
		lastSelectedFromUserRef.current = abs;
		onSelectFile(abs);
	};

	const handleDelete = useCallback(
		(absolutePath: string, name: string, isDirectory: boolean): void => {
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
					{ label: "Cancel", variant: "ghost" },
				],
			});
		},
		[workspaceId, deletePath],
	);

	// Capture-phase click intercept for our sidebar modifier intents:
	// Shift-click → open in new tab, Cmd/Ctrl-click → open in external editor.
	// Pierre would otherwise consume Shift/Meta for selection range/toggle.
	const handleClickCapture = useCallback(
		(e: React.MouseEvent<HTMLDivElement>) => {
			if (!rootPath) return;
			if (!(e.shiftKey || e.metaKey || e.ctrlKey)) return;
			const target = e.target as HTMLElement | null;
			const row = target?.closest<HTMLElement>("[data-path]");
			const treePath = row?.getAttribute("data-path");
			if (!treePath || treePath.endsWith("/")) return;
			e.preventDefault();
			e.stopPropagation();
			const abs = toAbs(rootPath, treePath);
			if (e.metaKey || e.ctrlKey) {
				openInExternalEditor(abs);
			} else {
				onSelectFile(abs, true);
			}
		},
		[rootPath, openInExternalEditor, onSelectFile],
	);

	const renderContextMenu = useCallback(
		(item: PierreContextMenuItem, ctx: PierreContextMenuOpenContext) => {
			const isFolder = item.kind === "directory";
			const treePath = isFolder
				? `${stripTrailingSlash(item.path)}/`
				: item.path;
			const abs = toAbs(rootPath, item.path);
			const rel = stripTrailingSlash(item.path);
			return (
				<RowContextMenu
					anchorRect={ctx.anchorRect}
					onClose={ctx.close}
					data-file-tree-context-menu-root="true"
				>
					{isFolder ? (
						<FolderMenuItems
							absolutePath={abs}
							relativePath={rel}
							onNewFile={() => void startCreating("file", abs)}
							onNewFolder={() => void startCreating("folder", abs)}
							onRename={() => model.startRenaming(treePath)}
							onDelete={() => handleDelete(abs, item.name, true)}
						/>
					) : (
						<FileMenuItems
							absolutePath={abs}
							relativePath={rel}
							onOpen={() => onSelectFile(abs)}
							onOpenInNewTab={() => onSelectFile(abs, true)}
							onOpenInEditor={() => openInExternalEditor(abs)}
							onRename={() => model.startRenaming(treePath)}
							onDelete={() => handleDelete(abs, item.name, false)}
						/>
					)}
				</RowContextMenu>
			);
		},
		[
			model,
			rootPath,
			startCreating,
			handleDelete,
			onSelectFile,
			openInExternalEditor,
		],
	);

	const collapseAll = useCallback(() => {
		for (const path of bridge.knownPaths) {
			if (!path.endsWith("/")) continue;
			const handle = asDirectoryHandle(model.getItem(path));
			if (handle?.isExpanded()) {
				handle.collapse();
			}
		}
	}, [model, bridge.knownPaths]);

	if (!rootPath) {
		return (
			<div className="flex h-full items-center justify-center gap-2 text-sm text-muted-foreground">
				{workspaceQuery.isLoading ? (
					<>
						<Loader2 className="size-3.5 animate-spin" />
						<span>Loading files...</span>
					</>
				) : (
					"Workspace worktree not available"
				)}
			</div>
		);
	}

	return (
		<div
			className="flex h-full min-h-0 flex-col overflow-hidden"
			onClickCapture={handleClickCapture}
		>
			<PierreFileTree
				model={model}
				className="flex-1 min-h-0"
				style={TREE_STYLE}
				header={
					<div className="group flex h-7 items-center justify-between bg-background px-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
						<span className="truncate">Explorer</span>
						<div className="flex items-center gap-0.5">
							<HeaderButton
								icon={FilePlus}
								label="New File"
								onClick={() => void startCreating("file")}
							/>
							<HeaderButton
								icon={FolderPlus}
								label="New Folder"
								onClick={() => void startCreating("folder")}
							/>
							<HeaderButton
								icon={RefreshCw}
								label="Refresh"
								loading={bridge.isRefreshing}
								onClick={() => void bridge.doRefresh()}
							/>
							<HeaderButton
								icon={FoldVertical}
								label="Collapse All"
								onClick={collapseAll}
							/>
						</div>
					</div>
				}
				renderContextMenu={renderContextMenu}
			/>
		</div>
	);
}

interface HeaderButtonProps {
	icon: React.ComponentType<{ className?: string }>;
	label: string;
	loading?: boolean;
	onClick: () => void;
}

function HeaderButton({
	icon: Icon,
	label,
	loading,
	onClick,
}: HeaderButtonProps) {
	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<Button
					variant="ghost"
					size="icon"
					className="size-5"
					onClick={onClick}
				>
					{loading ? (
						<Loader2 className="size-3 animate-spin" />
					) : (
						<Icon className="size-3" />
					)}
				</Button>
			</TooltipTrigger>
			<TooltipContent side="bottom">{label}</TooltipContent>
		</Tooltip>
	);
}

function buildPierreGitStatus(
	fileStatusByPath: Map<string, FileStatus>,
	ignoredPaths: Set<string>,
): {
	path: string;
	status:
		| "added"
		| "deleted"
		| "ignored"
		| "modified"
		| "renamed"
		| "untracked";
}[] {
	const entries: {
		path: string;
		status:
			| "added"
			| "deleted"
			| "ignored"
			| "modified"
			| "renamed"
			| "untracked";
	}[] = [];
	for (const [path, status] of fileStatusByPath) {
		entries.push({ path, status: PIERRE_GIT_STATUS[status] });
	}
	for (const path of ignoredPaths) {
		entries.push({ path, status: "ignored" });
	}
	return entries;
}

function deriveCreationParent(
	selectedFilePath: string | undefined,
	knownPaths: Set<string>,
	rootPath: string,
): string {
	if (!selectedFilePath) return rootPath;
	// If the selected path is itself a known directory, target it.
	const selectedRel = toRel(rootPath, selectedFilePath);
	if (knownPaths.has(`${selectedRel}/`)) return selectedFilePath;
	// Otherwise, target the selected file's parent dir.
	const lastSlash = selectedFilePath.lastIndexOf("/");
	return lastSlash > rootPath.length
		? selectedFilePath.slice(0, lastSlash)
		: rootPath;
}

function pickPlaceholderName(
	parentRel: string,
	mode: "file" | "folder",
	knownPaths: Set<string>,
): string {
	const base = mode === "folder" ? "Untitled" : "untitled";
	const suffix = mode === "folder" ? "/" : "";
	const prefix = parentRel ? `${parentRel}/` : "";
	if (!knownPaths.has(`${prefix}${base}${suffix}`)) return base;
	for (let i = 2; i < 100; i++) {
		const name = `${base}-${i}`;
		if (!knownPaths.has(`${prefix}${name}${suffix}`)) return name;
	}
	return `${base}-${Date.now()}`;
}
