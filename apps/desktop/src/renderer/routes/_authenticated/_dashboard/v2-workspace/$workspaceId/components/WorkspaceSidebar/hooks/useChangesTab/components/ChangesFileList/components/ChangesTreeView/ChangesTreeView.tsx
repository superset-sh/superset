import type {
	FileTreeDirectoryHandle,
	FileTreeRowDecoration,
	FileTreeRowDecorationContext,
	ContextMenuItem as PierreContextMenuItem,
	ContextMenuOpenContext as PierreContextMenuOpenContext,
} from "@pierre/trees";
import {
	FileTree as PierreFileTree,
	useFileTree as usePierreFileTree,
} from "@pierre/trees/react";
import { toast } from "@superset/ui/sonner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { workspaceTrpc } from "@superset/workspace-client";
import { Undo2 } from "lucide-react";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
	ShadowClickHint,
	usePierreRowClickPolicy,
	useSidebarFilePolicy,
} from "renderer/lib/clickPolicy";
import { loadFallthroughIcons } from "renderer/lib/fileIcons";
import { DiscardConfirmDialog } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/components/DiscardConfirmDialog";
import type { FileStatus } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/components/StatusIndicator";
import { PierreRowContextMenu } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/components/WorkspaceSidebar/components/PierreRowContextMenu";
import type { ChangesetFile } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/useChangeset";
import { toRelativeWorkspacePath } from "shared/absolute-paths";
import type { FoldSignal } from "../../ChangesFileList";
import { FileRowContextMenuItems } from "./components/FileRowContextMenuItems";
import { FolderContextMenuItems } from "./components/FolderContextMenuItems";
import { ShadowRowHoverActions } from "./components/ShadowRowHoverActions";

const ITEM_HEIGHT = 24;
// Pierre rows carry `margin-block: 1px`, so each row occupies ITEM_HEIGHT + 2px.
const ROW_BOX = ITEM_HEIGHT + 2;
// Small cushion so the last row never clips against the host's `overflow: hidden`.
const HEIGHT_CUSHION = 8;

const TREE_STYLE: React.CSSProperties = {
	"--trees-row-height-override": `${ITEM_HEIGHT}px`,
	"--trees-level-gap-override": "8px",
	"--trees-padding-inline-override": "0",
	"--trees-item-margin-x-override": "0",
	"--trees-item-padding-x-override": "calc(var(--spacing) * 3)",
	"--trees-item-row-gap-override": "calc(var(--spacing) * 1.5)",
	"--trees-icon-width-override": "calc(var(--spacing) * 3.5)",
	"--trees-border-radius-override": "0",

	"--trees-bg-override": "var(--background)",
	"--trees-fg-override": "var(--foreground)",
	"--trees-fg-muted-override": "var(--muted-foreground)",
	"--trees-bg-muted-override":
		"color-mix(in oklab, var(--accent) 50%, transparent)",
	"--trees-accent-override": "var(--accent)",
	"--trees-border-color-override": "var(--border)",

	"--trees-selected-bg-override": "var(--accent)",
	"--trees-selected-fg-override": "var(--accent-foreground)",
	"--trees-selected-focused-border-color-override": "var(--ring)",

	"--trees-focus-ring-color-override": "var(--ring)",
	"--trees-focus-ring-offset-override": "0px",

	"--trees-status-added-override": "oklch(0.627 0.194 149.214)",
	"--trees-status-untracked-override": "oklch(0.627 0.194 149.214)",
	"--trees-status-modified-override": "oklch(0.681 0.162 75.834)",
	"--trees-status-deleted-override": "oklch(0.577 0.245 27.325)",
	"--trees-status-renamed-override": "oklch(0.6 0.118 244.557)",
	"--trees-status-ignored-override": "var(--muted-foreground)",

	"--trees-font-size-override": "var(--text-xs)",
} as React.CSSProperties;

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

type SectionKind = ChangesetFile["source"]["kind"];

interface ChangesTreeViewProps {
	/** Files for a single section — caller has already pre-grouped by `source.kind`. */
	files: ChangesetFile[];
	/** Section the files came from; used to scope context-menu/hover Discard. */
	sectionKind: SectionKind;
	workspaceId: string;
	worktreePath?: string;
	/** Absolute path of the file whose diff is currently open, if any. */
	selectedFilePath?: string;
	/** Bumped by the toolbar's expand-all / collapse-all buttons. */
	foldSignal: FoldSignal;
	onSelectFile?: (path: string, openInNewTab?: boolean) => void;
	onOpenFile?: (absolutePath: string, openInNewTab?: boolean) => void;
	onOpenInEditor?: (path: string) => void;
}

/**
 * Tree view of a single changes section, powered by `@pierre/trees`. Pierre
 * builds the directory hierarchy from the flat path list and handles
 * virtualization + status tints + icons; we layer on:
 *
 *  - `renderRowDecoration`: `+N/−N` on files, file count on directories
 *  - `renderContextMenu`: file-row actions matching `FileRow`; folder-row
 *    actions (open in editor, copy path)
 *  - hover actions overlay (Discard on unstaged + more-actions ⌄ dropdown)
 *  - `usePierreRowClickPolicy` for settings-driven click routing
 *  - selection echo: when the diff pane's file is in this section, focus it
 *
 * The discard confirm dialog lives here, not in the per-row menus: Pierre
 * tears down `renderContextMenu` output when the menu closes, which would
 * unmount a dialog rendered inside it before the user could confirm.
 */
export const ChangesTreeView = memo(function ChangesTreeView({
	files,
	sectionKind,
	workspaceId,
	worktreePath,
	selectedFilePath,
	foldSignal,
	onSelectFile,
	onOpenFile,
	onOpenInEditor,
}: ChangesTreeViewProps) {
	const paths = useMemo(() => files.map((f) => f.path), [files]);
	const fileByPath = useMemo(() => {
		const map = new Map<string, ChangesetFile>();
		for (const file of files) map.set(file.path, file);
		return map;
	}, [files]);

	const { dirs, dirFileCount } = useMemo(() => buildTreeShape(paths), [paths]);

	const initialGitStatusEntriesRef = useRef(buildPierreGitStatus(files));

	// Callbacks routed through a ref so Pierre's stable handler closures
	// (resolved once at `useFileTree` time) always see the latest props.
	const handlersRef = useRef({
		onSelect(_path: string) {},
		renderRowDecoration(
			_ctx: FileTreeRowDecorationContext,
		): FileTreeRowDecoration | null {
			return null;
		},
	});

	const { model } = usePierreFileTree({
		paths,
		initialExpansion: "open",
		search: false,
		gitStatus: initialGitStatusEntriesRef.current,
		icons: { set: "complete", colored: true },
		itemHeight: ITEM_HEIGHT,
		overscan: 20,
		stickyFolders: true,
		onSelectionChange: (selected) => {
			const last = selected[selected.length - 1];
			if (!last || last.endsWith("/")) return;
			handlersRef.current.onSelect(last);
		},
		renderRowDecoration: (ctx) => handlersRef.current.renderRowDecoration(ctx),
	});

	// Keep Pierre's path set in sync as files churn (stage/unstage, new edits).
	useEffect(() => {
		model.resetPaths(paths);
	}, [model, paths]);

	useEffect(() => {
		model.setGitStatus(buildPierreGitStatus(files));
	}, [model, files]);

	// Fill in Material icons for file types Pierre's built-in set doesn't cover,
	// plus a Material default-file icon for anything still unmatched (matches
	// the Files tab). Initial render uses Pierre's defaults; the sprite-loading
	// cache makes repeat mounts a no-op.
	useEffect(() => {
		let cancelled = false;
		void loadFallthroughIcons().then((config) => {
			if (cancelled) return;
			model.setIcons({ set: "complete", colored: true, ...config });
		});
		return () => {
			cancelled = true;
		};
	}, [model]);

	// Pierre's host is `height: 100%` when virtualized — inside this section's
	// auto-height container that collapses to 0, so the tree would be
	// invisible. Size it to the content. Pierre already computes that height
	// (rendered rows × itemHeight, *after* it flattens single-child directory
	// chains into one row) and writes it to the virtualized list's inline
	// `style.height` — mirror that. A naive `dirs + files` count would
	// massively over-estimate because it doesn't know about flattening.
	const [contentHeight, setContentHeight] = useState<number | null>(null);
	useEffect(() => {
		const readHeight = (): boolean => {
			const list = model
				.getFileTreeContainer()
				?.shadowRoot?.querySelector<HTMLElement>(
					"[data-file-tree-virtualized-list]",
				);
			const h = list ? Number.parseFloat(list.style.height) : Number.NaN;
			if (Number.isFinite(h) && h > 0) {
				setContentHeight(h);
				return true;
			}
			return false;
		};
		let raf = 0;
		let attempts = 0;
		const retryUntilReady = () => {
			if (readHeight() || attempts++ > 30) return;
			raf = requestAnimationFrame(retryUntilReady);
		};
		retryUntilReady();
		// Pierre rewrites `style.height` when the rendered row count changes
		// (resetPaths, expand/collapse); re-read on the next frame after each.
		const unsubscribe = model.subscribe(() => {
			raf = requestAnimationFrame(readHeight);
		});
		return () => {
			cancelAnimationFrame(raf);
			unsubscribe();
		};
	}, [model]);
	const treeHeight =
		contentHeight != null
			? contentHeight + HEIGHT_CUSHION
			: (dirs.length + paths.length) * ROW_BOX + HEIGHT_CUSHION;

	const setAllDirsExpanded = useCallback(
		(expanded: boolean) => {
			for (const dir of dirs) {
				const handle = model.getItem(`${dir}/`);
				if (handle?.isDirectory() !== true) continue;
				const dirHandle = handle as FileTreeDirectoryHandle;
				if (dirHandle.isExpanded() === expanded) continue;
				if (expanded) dirHandle.expand();
				else dirHandle.collapse();
			}
		},
		[model, dirs],
	);

	// React to expand-all / collapse-all from the toolbar (new signal only).
	const lastFoldEpochRef = useRef(0);
	useEffect(() => {
		if (foldSignal.epoch === 0 || foldSignal.epoch === lastFoldEpochRef.current)
			return;
		lastFoldEpochRef.current = foldSignal.epoch;
		setAllDirsExpanded(foldSignal.action === "expand");
	}, [foldSignal, setAllDirsExpanded]);

	// Echo the diff pane's open file back into the tree's selection — but only
	// when it belongs to this section. `lastUserSelectRef` guards the loop:
	// after the user clicks a row, the parent's selectedFilePath comes back to
	// us and we must not re-focus (which would re-fire onSelectionChange).
	const lastUserSelectRef = useRef<string | null>(null);
	const selectedRelPath =
		selectedFilePath && worktreePath
			? toRelativeWorkspacePath(worktreePath, selectedFilePath)
			: selectedFilePath;
	useEffect(() => {
		if (!selectedRelPath || !fileByPath.has(selectedRelPath)) return;
		if (lastUserSelectRef.current === selectedRelPath) {
			lastUserSelectRef.current = null;
			return;
		}
		model.focusPath(selectedRelPath);
	}, [model, selectedRelPath, fileByPath]);

	handlersRef.current.onSelect = (treePath) => {
		lastUserSelectRef.current = treePath;
		onSelectFile?.(treePath, false);
	};
	// Pierre's row decoration accepts text or icon, not arbitrary JSX. The
	// status indicator is already painted by `setGitStatus` (row tint + icon),
	// so we contribute the `+N/−N` summary on files (uncolored — a library
	// limitation) and the file count on directories.
	handlersRef.current.renderRowDecoration = (ctx) => {
		if (ctx.item.kind === "directory") {
			const count = dirFileCount.get(stripTrailingSlash(ctx.item.path));
			return count ? { text: String(count) } : null;
		}
		const file = fileByPath.get(ctx.item.path);
		if (!file) return null;
		const text = formatDiffStats(file.additions, file.deletions);
		return text ? { text } : null;
	};

	const filePolicy = useSidebarFilePolicy();
	const { onClickCapture, findFileRow } = usePierreRowClickPolicy({
		filePolicy,
		onSelectFile: (rel, openInNewTab) => {
			lastUserSelectRef.current = rel;
			onSelectFile?.(rel, openInNewTab);
		},
		openInExternalEditor: (rel) => onOpenInEditor?.(rel),
	});

	// Hoisted so the dialog outlives the menu/hover overlay that triggers it.
	const [discardTarget, setDiscardTarget] = useState<ChangesetFile | null>(
		null,
	);
	const utils = workspaceTrpc.useUtils();
	const discardMutation = workspaceTrpc.git.discardChanges.useMutation({
		onSuccess: () => {
			void utils.git.getStatus.invalidate({ workspaceId });
			void utils.git.getDiff.invalidate({ workspaceId });
		},
		onError: (err) => {
			toast.error("Couldn't discard changes", { description: err.message });
		},
	});

	const fileMenuItems = (file: ChangesetFile) => (
		<FileRowContextMenuItems
			file={file}
			worktreePath={worktreePath}
			sectionKind={sectionKind}
			onSelectFile={onSelectFile}
			onOpenFile={onOpenFile}
			onOpenInEditor={onOpenInEditor}
			onRequestDiscard={setDiscardTarget}
		/>
	);

	const renderContextMenu = (
		item: PierreContextMenuItem,
		ctx: PierreContextMenuOpenContext,
	) => {
		const menuItems = (() => {
			if (item.kind === "directory") {
				return (
					<FolderContextMenuItems
						relativePath={stripTrailingSlash(item.path)}
						worktreePath={worktreePath}
						onOpenInEditor={onOpenInEditor}
					/>
				);
			}
			const file = fileByPath.get(item.path);
			return file ? fileMenuItems(file) : null;
		})();
		if (!menuItems) return null;
		return (
			<PierreRowContextMenu
				anchorRect={ctx.anchorRect}
				onClose={ctx.close}
				data-file-tree-context-menu-root="true"
			>
				{menuItems}
			</PierreRowContextMenu>
		);
	};

	const renderHoverInlineActions = (treePath: string) => {
		if (sectionKind !== "unstaged") return null;
		const file = fileByPath.get(treePath);
		if (!file) return null;
		return (
			<Tooltip>
				<TooltipTrigger asChild>
					<button
						type="button"
						aria-label="Discard changes"
						className="flex size-5 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-destructive"
						onClick={(e) => {
							e.stopPropagation();
							setDiscardTarget(file);
						}}
					>
						<Undo2 className="size-3.5" />
					</button>
				</TooltipTrigger>
				<TooltipContent side="top">Discard changes</TooltipContent>
			</Tooltip>
		);
	};

	const renderHoverMenuContent = (treePath: string) => {
		const file = fileByPath.get(treePath);
		return file ? fileMenuItems(file) : null;
	};

	const discardIsDelete =
		discardTarget?.status === "untracked" || discardTarget?.status === "added";
	const discardBasename = discardTarget
		? (discardTarget.path.split("/").pop() ?? discardTarget.path)
		: "";

	return (
		<div onClickCapture={onClickCapture}>
			<ShadowClickHint hint={filePolicy.hint} findRow={findFileRow}>
				<ShadowRowHoverActions
					findFileRow={findFileRow}
					renderInlineActions={renderHoverInlineActions}
					renderMenuContent={renderHoverMenuContent}
				>
					<PierreFileTree
						model={model}
						style={{ ...TREE_STYLE, height: treeHeight }}
						renderContextMenu={renderContextMenu}
					/>
				</ShadowRowHoverActions>
			</ShadowClickHint>
			{discardTarget && (
				<DiscardConfirmDialog
					open
					onOpenChange={(open) => !open && setDiscardTarget(null)}
					title={
						discardIsDelete
							? `Delete "${discardBasename}"?`
							: `Discard changes to "${discardBasename}"?`
					}
					description={
						discardIsDelete
							? "This will permanently delete this file. This action cannot be undone."
							: "This will revert all changes to this file. This action cannot be undone."
					}
					confirmLabel={discardIsDelete ? "Delete" : "Discard"}
					onConfirm={() => {
						const target = discardTarget;
						setDiscardTarget(null);
						discardMutation.mutate({
							workspaceId,
							filePath: target.path,
						});
					}}
				/>
			)}
		</div>
	);
});

/**
 * From a flat list of file paths, return every directory path implied by them
 * (sorted shallow→deep, so a directory's ancestors precede it) and a map of
 * directory → count of files anywhere beneath it.
 */
function buildTreeShape(paths: string[]): {
	dirs: string[];
	dirFileCount: Map<string, number>;
} {
	const dirs: string[] = [];
	const seen = new Set<string>();
	const dirFileCount = new Map<string, number>();
	for (const path of paths) {
		const segments = path.split("/");
		let acc = "";
		for (let i = 0; i < segments.length - 1; i++) {
			acc = acc ? `${acc}/${segments[i]}` : segments[i];
			if (!seen.has(acc)) {
				seen.add(acc);
				dirs.push(acc);
			}
			dirFileCount.set(acc, (dirFileCount.get(acc) ?? 0) + 1);
		}
	}
	dirs.sort(
		(a, b) => a.split("/").length - b.split("/").length || a.localeCompare(b),
	);
	return { dirs, dirFileCount };
}

function buildPierreGitStatus(files: ChangesetFile[]): {
	path: string;
	status: "added" | "deleted" | "modified" | "renamed" | "untracked";
}[] {
	return files.map((file) => ({
		path: file.path,
		status: PIERRE_GIT_STATUS[file.status],
	}));
}

function formatDiffStats(additions: number, deletions: number): string {
	if (additions === 0 && deletions === 0) return "";
	if (additions === 0) return `−${deletions}`;
	if (deletions === 0) return `+${additions}`;
	return `+${additions} −${deletions}`;
}

function stripTrailingSlash(path: string): string {
	return path.endsWith("/") ? path.slice(0, -1) : path;
}
