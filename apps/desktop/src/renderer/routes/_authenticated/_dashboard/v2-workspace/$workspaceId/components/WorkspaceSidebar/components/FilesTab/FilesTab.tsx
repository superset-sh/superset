import type {
	FileTreeRenameEvent,
	FileTreeRowDecoration,
	FileTreeRowDecorationContext,
	ContextMenuItem as PierreContextMenuItem,
	ContextMenuOpenContext as PierreContextMenuOpenContext,
} from "@pierre/trees";
import {
	FileTree as PierreFileTree,
	useFileTree as usePierreFileTree,
} from "@pierre/trees/react";
import type { AppRouter } from "@superset/host-service";
import { toast } from "@superset/ui/sonner";
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
import { useGitStatusMap } from "renderer/hooks/host-service/useGitStatusMap";
import {
	ShadowClickHint,
	usePierreRowClickPolicy,
	useSidebarFilePolicy,
} from "renderer/lib/clickPolicy";
import { useFallthroughIcons } from "renderer/lib/fileIcons";
import { createPierreTreeStyle } from "renderer/lib/pierreTree";
import { useOpenInExternalEditor } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/useOpenInExternalEditor";
import { PierreRowContextMenu } from "../PierreRowContextMenu";
import { FileMenuItems } from "./components/FileMenuItems";
import { FilesTabHeaderButton } from "./components/FilesTabHeaderButton";
import { FolderMenuItems } from "./components/FolderMenuItems";
import {
	FILE_EXPLORER_INDENT,
	FILE_EXPLORER_OVERSCAN,
	FILE_EXPLORER_ROW_HEIGHT,
} from "./constants";
import { useFilesTabActions } from "./hooks/useFilesTabActions";
import { useFilesTabBridge } from "./hooks/useFilesTabBridge";
import { buildPierreGitStatus } from "./utils/buildPierreGitStatus";
import { stripTrailingSlash, toAbs, toRel } from "./utils/treePath";

const TREE_STYLE = createPierreTreeStyle({
	rowHeight: FILE_EXPLORER_ROW_HEIGHT,
	levelIndent: FILE_EXPLORER_INDENT,
	withSearchChrome: true,
});

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
	const filePolicy = useSidebarFilePolicy();

	const { fileStatusByPath, folderStatusByPath, ignoredPaths } =
		useGitStatusMap(gitStatus);

	// Pierre's `gitStatus` is consumed only at construction; live updates
	// flow via model.setGitStatus in an effect below.
	const initialGitStatusEntriesRef = useRef(
		buildPierreGitStatus(fileStatusByPath, folderStatusByPath, ignoredPaths),
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
		renderRowDecoration(
			_ctx: FileTreeRowDecorationContext,
		): FileTreeRowDecoration | null {
			return null;
		},
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
		itemHeight: FILE_EXPLORER_ROW_HEIGHT,
		overscan: FILE_EXPLORER_OVERSCAN,
		stickyFolders: true,
		onSelectionChange: (paths) => {
			const last = paths[paths.length - 1];
			if (!last) return;
			// Pierre uses trailing-slash paths for directories; we only fire
			// onSelectFile for files (clicking a folder toggles expansion).
			if (last.endsWith("/")) return;
			handlersRef.current.onSelect(last);
		},
		renderRowDecoration: (ctx) => handlersRef.current.renderRowDecoration(ctx),
	});

	const bridge = useFilesTabBridge({ model, workspaceId, rootPath });
	const { reveal, startCreating, handleRename, handleDelete, collapseAll } =
		useFilesTabActions({
			model,
			bridge,
			rootPath,
			workspaceId,
			selectedFilePath,
			onSelectFile,
		});

	// Push live git status updates into Pierre.
	useEffect(() => {
		model.setGitStatus(
			buildPierreGitStatus(fileStatusByPath, folderStatusByPath, ignoredPaths),
		);
	}, [model, fileStatusByPath, folderStatusByPath, ignoredPaths]);

	useFallthroughIcons(model);

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

	useEffect(() => {
		if (!pendingReveal || !rootPath) return;
		void reveal(pendingReveal.path, pendingReveal.isDirectory);
	}, [pendingReveal, rootPath, reveal]);

	// Wire the ref-based handlers so Pierre's stable callbacks always reach
	// the latest closures. Updated on every render — no diffing needed.
	handlersRef.current.onRename = (event) => void handleRename(event);
	handlersRef.current.onSelect = (treePath) => {
		const abs = toAbs(rootPath, treePath);
		lastSelectedFromUserRef.current = abs;
		onSelectFile(abs);
	};
	// No-op: Pierre's setGitStatus already renders its own per-row status
	// indicator (and tints the row text), so a custom decoration here would
	// duplicate it. Kept the wiring in place in case we want to layer
	// something Pierre doesn't show (e.g. lock icons, debug markers).
	handlersRef.current.renderRowDecoration = () => null;

	// Hint tooltip uses ShadowClickHint to anchor a single shadcn Tooltip
	// over the hovered row's bounding rect — Pierre owns the row DOM inside
	// an open shadow root, so per-row Tooltip wrappers aren't possible.
	// Folders are excluded since folder intents are hardcoded.
	// The hook fires Pierre's relative path; this surface's external
	// contract is absolute, so wrap each callback to join with `rootPath`.
	const { onClickCapture: handleClickCapture, findFileRow } =
		usePierreRowClickPolicy({
			filePolicy,
			onSelectFile: (rel, openInNewTab) =>
				onSelectFile(toAbs(rootPath, rel), openInNewTab),
			openInExternalEditor: (rel) => openInExternalEditor(toAbs(rootPath, rel)),
		});

	const renderContextMenu = useCallback(
		(item: PierreContextMenuItem, ctx: PierreContextMenuOpenContext) => {
			const isFolder = item.kind === "directory";
			const treePath = isFolder
				? `${stripTrailingSlash(item.path)}/`
				: item.path;
			const abs = toAbs(rootPath, item.path);
			const rel = stripTrailingSlash(item.path);
			return (
				<PierreRowContextMenu
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
				</PierreRowContextMenu>
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
			<ShadowClickHint hint={filePolicy.hint} findRow={findFileRow}>
				<PierreFileTree
					model={model}
					className="flex-1 min-h-0"
					style={TREE_STYLE}
					header={
						<div className="group flex h-7 items-center justify-between bg-background px-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
							<span className="truncate">Explorer</span>
							<div className="flex items-center gap-0.5">
								<FilesTabHeaderButton
									icon={FilePlus}
									label="New File"
									onClick={() => void startCreating("file")}
								/>
								<FilesTabHeaderButton
									icon={FolderPlus}
									label="New Folder"
									onClick={() => void startCreating("folder")}
								/>
								<FilesTabHeaderButton
									icon={RefreshCw}
									label="Refresh"
									loading={bridge.isRefreshing}
									onClick={() => void bridge.doRefresh()}
								/>
								<FilesTabHeaderButton
									icon={FoldVertical}
									label="Collapse All"
									onClick={collapseAll}
								/>
							</div>
						</div>
					}
					renderContextMenu={renderContextMenu}
				/>
			</ShadowClickHint>
		</div>
	);
}
