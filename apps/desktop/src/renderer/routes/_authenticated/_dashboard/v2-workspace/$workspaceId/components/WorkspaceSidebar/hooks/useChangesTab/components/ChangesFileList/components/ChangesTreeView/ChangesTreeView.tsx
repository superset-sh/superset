import type {
	FileTree,
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
import { memo, useEffect, useMemo, useRef, useState } from "react";
import {
	ShadowClickHint,
	usePierreRowClickPolicy,
	useSidebarFilePolicy,
} from "renderer/lib/clickPolicy";
import { DiscardConfirmDialog } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/components/DiscardConfirmDialog";
import type { FileStatus } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/components/StatusIndicator";
import { PierreRowContextMenu } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/components/WorkspaceSidebar/components/PierreRowContextMenu";
import type { ChangesetFile } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/useChangeset";
import { toRelativeWorkspacePath } from "shared/absolute-paths";
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

type SectionKind = "unstaged" | "staged" | "against-base" | "commit";

interface ChangesTreeViewProps {
	/** Files for a single section — caller has already pre-grouped by `source.kind`. */
	files: ChangesetFile[];
	/** Section the files came from; used to scope context-menu/hover Discard. */
	sectionKind: SectionKind;
	workspaceId: string;
	worktreePath?: string;
	/** Absolute path of the file whose diff is currently open, if any. */
	selectedFilePath?: string;
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

	// Pierre's host element is `height: 100%` when virtualized — inside this
	// section's auto-height container that collapses to 0, so the tree would be
	// invisible. We size the tree explicitly to its content. `dirs` is sorted
	// shallow→deep so `countVisibleRows` can resolve each dir's ancestors first.
	const { dirs, fileParents, dirFileCount } = useMemo(
		() => buildTreeShape(paths),
		[paths],
	);

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

	// Track the visible row count (shrinks when the user collapses a folder) so
	// the explicit tree height tracks the actual content height.
	const [visibleRowCount, setVisibleRowCount] = useState(
		() => dirs.length + paths.length,
	);
	useEffect(() => {
		const recompute = () =>
			setVisibleRowCount(countVisibleRows(model, dirs, fileParents));
		recompute();
		return model.subscribe(recompute);
	}, [model, dirs, fileParents]);
	const treeHeight = visibleRowCount * ROW_BOX + HEIGHT_CUSHION;

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

	const renderContextMenu = (
		item: PierreContextMenuItem,
		ctx: PierreContextMenuOpenContext,
	) => {
		if (item.kind === "directory") {
			return (
				<PierreRowContextMenu
					anchorRect={ctx.anchorRect}
					onClose={ctx.close}
					data-file-tree-context-menu-root="true"
				>
					<FolderContextMenuItems
						relativePath={stripTrailingSlash(item.path)}
						worktreePath={worktreePath}
						onOpenInEditor={onOpenInEditor}
					/>
				</PierreRowContextMenu>
			);
		}
		const file = fileByPath.get(item.path);
		if (!file) return null;
		return (
			<PierreRowContextMenu
				anchorRect={ctx.anchorRect}
				onClose={ctx.close}
				data-file-tree-context-menu-root="true"
			>
				<FileRowContextMenuItems
					file={file}
					worktreePath={worktreePath}
					sectionKind={sectionKind}
					onSelectFile={onSelectFile}
					onOpenFile={onOpenFile}
					onOpenInEditor={onOpenInEditor}
					onRequestDiscard={setDiscardTarget}
				/>
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
		if (!file) return null;
		return (
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
 * From a flat list of file paths, return: every directory path implied by them
 * (sorted shallow→deep), the parent directory of each file, and a map of
 * directory → count of files anywhere beneath it. Root-level files report `""`
 * as their parent and don't contribute to any directory's count.
 */
function buildTreeShape(paths: string[]): {
	dirs: string[];
	fileParents: string[];
	dirFileCount: Map<string, number>;
} {
	const dirs: string[] = [];
	const seen = new Set<string>();
	const fileParents: string[] = [];
	const dirFileCount = new Map<string, number>();
	for (const path of paths) {
		const segments = path.split("/");
		fileParents.push(
			segments.length > 1 ? segments.slice(0, -1).join("/") : "",
		);
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
	return { dirs, fileParents, dirFileCount };
}

/**
 * Count the rows Pierre currently renders: every directory whose ancestors are
 * all expanded, plus every file under such a directory. `dirs` must be sorted
 * shallow→deep. Pierre defaults directories to expanded (`initialExpansion`),
 * so a missing/unknown handle counts as expanded.
 */
function countVisibleRows(
	model: FileTree,
	dirs: string[],
	fileParents: string[],
): number {
	const renderedDirs = new Set<string>();
	const expandedAndVisible = new Set<string>();
	for (const dir of dirs) {
		const lastSlash = dir.lastIndexOf("/");
		const parent = lastSlash < 0 ? "" : dir.slice(0, lastSlash);
		if (parent !== "" && !expandedAndVisible.has(parent)) continue;
		renderedDirs.add(dir);
		const handle = model.getItem(`${dir}/`);
		const expanded =
			handle?.isDirectory() === true
				? (handle as FileTreeDirectoryHandle).isExpanded()
				: true;
		if (expanded) expandedAndVisible.add(dir);
	}
	let count = renderedDirs.size;
	for (const parent of fileParents) {
		if (parent === "" || expandedAndVisible.has(parent)) count += 1;
	}
	return count;
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
