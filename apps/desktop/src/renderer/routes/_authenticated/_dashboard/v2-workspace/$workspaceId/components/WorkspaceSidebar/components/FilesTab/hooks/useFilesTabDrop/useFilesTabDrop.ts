import type { FileTree } from "@pierre/trees";
import { alert } from "@superset/ui/atoms/Alert";
import { toast } from "@superset/ui/sonner";
import { workspaceTrpc } from "@superset/workspace-client";
import { useCallback, useEffect, useState } from "react";
import {
	asDirectoryHandle,
	basename,
	parentRel,
	stripTrailingSlash,
	toAbs,
} from "../../utils/treePath";
import type { FilesTabBridge } from "../useFilesTabBridge";

interface UseFilesTabDropOptions {
	model: FileTree;
	bridge: FilesTabBridge;
	/** Workspace worktree root (absolute). */
	rootPath: string;
	workspaceId: string;
}

/** Position of the destination folder's row, relative to the tree wrapper. */
export interface DropRowRect {
	top: number;
	left: number;
	width: number;
	height: number;
}

export interface FilesTabDropTarget {
	/** Relative directory the dropped files write into. "" = worktree root. */
	dirRel: string;
	/** Human label for the overlay — folder basename, or "workspace root". */
	label: string;
	/**
	 * The destination folder row to highlight, or null when dropping into the
	 * root (no row represents it) — the overlay then frames the whole tree.
	 */
	rect: DropRowRect | null;
}

export interface FilesTabDrop {
	/** Non-null while an external file drag hovers the tree. */
	dropTarget: FilesTabDropTarget | null;
	onDragOver(e: React.DragEvent<HTMLDivElement>): void;
	onDragLeave(e: React.DragEvent<HTMLDivElement>): void;
	onDrop(e: React.DragEvent<HTMLDivElement>): void;
}

/** A file to upload, keyed by its path relative to the drop destination. */
interface DroppedFile {
	relPath: string;
	file: File;
}

/** Flattened drop payload: files to write + directories to (re)create. */
interface DroppedTree {
	files: DroppedFile[];
	/** Directory paths relative to the drop destination (includes empty dirs). */
	dirs: string[];
}

/** True when the drag carries OS files (vs. an internal/text drag). */
function dragHasFiles(e: React.DragEvent): boolean {
	return Array.from(e.dataTransfer.types).includes("Files");
}

/**
 * The tree row under the cursor. `@pierre/trees` stamps `data-item-path` and
 * renders rows in an open shadow root, so we walk `composedPath()` to find it.
 */
function findRowUnderCursor(e: React.DragEvent): HTMLElement | null {
	for (const node of e.nativeEvent.composedPath()) {
		if (node instanceof HTMLElement && node.getAttribute("data-item-path")) {
			return node;
		}
	}
	return null;
}

/**
 * Destination directory for a row: directory rows carry a trailing slash → drop
 * into that folder; file rows → their parent; no row → worktree root.
 */
function rowToDirRel(row: HTMLElement | null): string {
	const itemPath = row?.getAttribute("data-item-path");
	if (!itemPath) return "";
	return itemPath.endsWith("/")
		? stripTrailingSlash(itemPath)
		: parentRel(itemPath);
}

function resolveDropDirRel(e: React.DragEvent): string {
	return rowToDirRel(findRowUnderCursor(e));
}

function dirLabel(dirRel: string): string {
	return dirRel === "" ? "workspace root" : basename(dirRel);
}

/** Locate the rendered row element for a directory within the same tree. */
function findDirRow(sibling: HTMLElement, dirRel: string): HTMLElement | null {
	const root = sibling.getRootNode();
	if (!(root instanceof ShadowRoot || root instanceof Document)) return null;
	return root.querySelector<HTMLElement>(
		`[data-item-path=${CSS.escape(`${dirRel}/`)}]`,
	);
}

/**
 * Resolve the full drop target — destination directory + the screen rect of the
 * folder row to highlight (relative to the tree wrapper, so the overlay can
 * position itself). Returns a null rect for root drops.
 */
function resolveDropTarget(
	e: React.DragEvent<HTMLDivElement>,
): FilesTabDropTarget {
	const row = findRowUnderCursor(e);
	const dirRel = rowToDirRel(row);
	const destRow = dirRel && row ? findDirRow(row, dirRel) : null;

	let rect: DropRowRect | null = null;
	if (destRow) {
		const wrapper = e.currentTarget.getBoundingClientRect();
		const r = destRow.getBoundingClientRect();
		rect = {
			top: r.top - wrapper.top,
			left: r.left - wrapper.left,
			width: r.width,
			height: r.height,
		};
	}

	return { dirRel, label: dirLabel(dirRel), rect };
}

function rectsEqual(a: DropRowRect | null, b: DropRowRect | null): boolean {
	if (a === b) return true;
	if (!a || !b) return false;
	return (
		a.top === b.top &&
		a.left === b.left &&
		a.width === b.width &&
		a.height === b.height
	);
}

function targetsEqual(
	a: FilesTabDropTarget | null,
	b: FilesTabDropTarget,
): boolean {
	return a !== null && a.dirRel === b.dirRel && rectsEqual(a.rect, b.rect);
}

/**
 * Capture the dropped entries synchronously. `webkitGetAsEntry` and the items
 * list are only valid during event dispatch, but the returned entry handles
 * stay usable across the later async traversal. Falls back to the flat file
 * list when the entry API is unavailable (no folder support in that case).
 */
function collectDroppedEntries(e: React.DragEvent): {
	entries: FileSystemEntry[];
	fallbackFiles: File[];
} {
	const items = Array.from(e.dataTransfer.items);
	const supportsEntries =
		items.length > 0 && typeof items[0].webkitGetAsEntry === "function";

	if (!supportsEntries) {
		return { entries: [], fallbackFiles: Array.from(e.dataTransfer.files) };
	}

	const entries: FileSystemEntry[] = [];
	for (const item of items) {
		if (item.kind !== "file") continue;
		const entry = item.webkitGetAsEntry();
		if (entry) entries.push(entry);
	}
	return { entries, fallbackFiles: [] };
}

function getFile(entry: FileSystemFileEntry): Promise<File> {
	return new Promise((resolve, reject) => entry.file(resolve, reject));
}

/** Drain a directory reader — `readEntries` yields entries in batches. */
async function readAllEntries(
	reader: FileSystemDirectoryReader,
): Promise<FileSystemEntry[]> {
	const all: FileSystemEntry[] = [];
	while (true) {
		const batch = await new Promise<FileSystemEntry[]>((resolve, reject) =>
			reader.readEntries(resolve, reject),
		);
		if (batch.length === 0) break;
		all.push(...batch);
	}
	return all;
}

/** Recursively flatten one dropped entry into files + directory paths. */
async function flattenEntry(
	entry: FileSystemEntry,
	prefix: string,
): Promise<DroppedTree> {
	if (entry.isFile) {
		const file = await getFile(entry as FileSystemFileEntry);
		return { files: [{ relPath: `${prefix}${entry.name}`, file }], dirs: [] };
	}

	const dirRel = `${prefix}${entry.name}`;
	const children = await readAllEntries(
		(entry as FileSystemDirectoryEntry).createReader(),
	);
	const subtrees = await Promise.all(
		children.map((child) => flattenEntry(child, `${dirRel}/`)),
	);
	return {
		files: subtrees.flatMap((t) => t.files),
		dirs: [dirRel, ...subtrees.flatMap((t) => t.dirs)],
	};
}

async function flattenEntries(
	entries: FileSystemEntry[],
): Promise<DroppedTree> {
	const trees = await Promise.all(
		entries.map((entry) => flattenEntry(entry, "")),
	);
	return {
		files: trees.flatMap((t) => t.files),
		dirs: trees.flatMap((t) => t.dirs),
	};
}

/** Read a File into base64 (handles binary + large files via the reader). */
function fileToBase64(file: File): Promise<string> {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = () => {
			const result = reader.result;
			if (typeof result !== "string") {
				reject(new Error("Unexpected file reader result"));
				return;
			}
			// Strip the "data:<mime>;base64," prefix.
			const comma = result.indexOf(",");
			resolve(comma >= 0 ? result.slice(comma + 1) : result);
		};
		reader.onerror = () =>
			reject(reader.error ?? new Error("Failed to read file"));
		reader.readAsDataURL(file);
	});
}

/**
 * Drag-and-drop file upload for the v2 Files tab. Dropping OS files/folders onto
 * a folder row writes them into that folder (onto a file row → its parent, onto
 * empty space → the worktree root), preserving any nested folder structure.
 * Each file's bytes are read in the renderer and written via
 * `filesystem.writeFile` (base64) — the host sandboxes write destinations to the
 * worktree but never sees an external source path, so this works for both local
 * and remote workspaces. New entries surface through the bridge's `fs:events`
 * reconciliation; we also expand + fetch the destination so they appear without
 * a manual refresh.
 */
export function useFilesTabDrop({
	model,
	bridge,
	rootPath,
	workspaceId,
}: UseFilesTabDropOptions): FilesTabDrop {
	const writeFile = workspaceTrpc.filesystem.writeFile.useMutation();
	const createDirectory =
		workspaceTrpc.filesystem.createDirectory.useMutation();
	const [dropTarget, setDropTarget] = useState<FilesTabDropTarget | null>(null);

	// Clear the overlay if the drag ends outside our handlers (released over
	// another window, dropped elsewhere, or canceled with Esc).
	useEffect(() => {
		const clear = () => setDropTarget(null);
		window.addEventListener("dragend", clear);
		window.addEventListener("drop", clear);
		return () => {
			window.removeEventListener("dragend", clear);
			window.removeEventListener("drop", clear);
		};
	}, []);

	const uploadDropped = useCallback(
		async (
			dirRel: string,
			entries: FileSystemEntry[],
			fallbackFiles: File[],
		): Promise<void> => {
			const destDirAbs = toAbs(rootPath, dirRel);
			const versionToken = bridge.getVersion();

			let tree: DroppedTree;
			try {
				tree =
					entries.length > 0
						? await flattenEntries(entries)
						: {
								files: fallbackFiles.map((file) => ({
									relPath: file.name,
									file,
								})),
								dirs: [],
							};
			} catch {
				// A single unreadable entry rejects the whole traversal; surface it
				// instead of failing silently as an unhandled rejection.
				if (bridge.isCurrent(versionToken)) {
					toast.error("Could not read the dropped files");
				}
				return;
			}

			if (!bridge.isCurrent(versionToken)) return;

			if (tree.files.length === 0 && tree.dirs.length === 0) {
				toast.error("Could not read the dropped files");
				return;
			}

			// Create directories shallowest-first so parents exist before
			// children; recursive makes the calls idempotent.
			const dirs = Array.from(new Set(tree.dirs)).sort(
				(a, b) => a.split("/").length - b.split("/").length,
			);
			let createdDirs = 0;
			let failedDirs = 0;
			for (const relDir of dirs) {
				if (!bridge.isCurrent(versionToken)) return;
				try {
					await createDirectory.mutateAsync({
						workspaceId,
						absolutePath: `${destDirAbs}/${relDir}`,
						recursive: true,
					});
					createdDirs += 1;
				} catch (error) {
					failedDirs += 1;
					console.error("[v2 FilesTab] createDirectory failed", {
						relDir,
						error,
					});
				}
			}

			// Write a single dropped file. Returns "exists" when the host reports a
			// name collision (only possible with overwrite off); throws otherwise.
			const writeOneFile = async (
				relPath: string,
				file: File,
				overwrite: boolean,
			): Promise<"ok" | "exists"> => {
				const data = await fileToBase64(file);
				const result = await writeFile.mutateAsync({
					workspaceId,
					absolutePath: `${destDirAbs}/${relPath}`,
					content: { kind: "base64", data },
					options: { create: true, overwrite },
				});
				if (result && result.ok === false) {
					if (!overwrite && result.reason === "exists") return "exists";
					throw new Error(result.reason ?? "write failed");
				}
				return "ok";
			};

			// Upload one file at a time: encoding everything up front would hold
			// every base64 payload (~1.33x each) in memory at once, and a per-file
			// version check lets a workspace switch stop the remaining writes
			// instead of dribbling them into a worktree the user has left. Files
			// whose names already exist are collected (not overwritten) and the
			// user is asked to confirm replacement below.
			let added = 0;
			let failed = 0;
			const collisions: DroppedFile[] = [];
			for (const { relPath, file } of tree.files) {
				if (!bridge.isCurrent(versionToken)) break;
				try {
					if ((await writeOneFile(relPath, file, false)) === "exists") {
						collisions.push({ relPath, file });
					} else {
						added += 1;
					}
				} catch (error) {
					failed += 1;
					console.error("[v2 FilesTab] upload failed", { relPath, error });
				}
			}

			// User switched workspaces mid-upload — don't toast/expand against the
			// new tree.
			if (!bridge.isCurrent(versionToken)) return;

			const where = dirLabel(dirRel);
			if (added > 0) {
				toast.success(
					added === 1
						? `Added 1 file to ${where}`
						: `Added ${added} files to ${where}`,
				);
			} else if (createdDirs > 0 && failed === 0 && failedDirs === 0) {
				toast.success(
					createdDirs === 1
						? `Created 1 folder in ${where}`
						: `Created ${createdDirs} folders in ${where}`,
				);
			}
			// A failed directory cascades into failures for its files, so prefer
			// the file count; only fall back to the folder count when nothing but
			// directory creation failed (e.g. an empty folder).
			if (failed > 0) {
				toast.error(
					failed === 1
						? "Failed to add 1 file"
						: `Failed to add ${failed} files`,
				);
			} else if (failedDirs > 0) {
				toast.error(
					failedDirs === 1
						? "Failed to create 1 folder"
						: `Failed to create ${failedDirs} folders`,
				);
			}

			// Surface the new entries immediately. fs:events also reconciles, but
			// expanding + fetching avoids waiting on the watcher and shows results
			// inside a collapsed destination folder.
			if (added > 0 || createdDirs > 0) {
				if (dirRel) {
					const handle = asDirectoryHandle(model.getItem(`${dirRel}/`));
					if (handle && !handle.isExpanded()) handle.expand();
				}
				void bridge.fetchDir(dirRel);
			}

			// Name collisions: the host left these untouched (overwrite off), so
			// confirm before replacing. Replacing only overwrites existing rows —
			// no tree-shape change — so no refresh is needed afterward.
			if (collisions.length === 0) return;
			const many = collisions.length > 1;
			const firstName = basename(collisions[0].relPath);
			alert({
				title: many
					? `${collisions.length} files already exist in ${where}. Do you want to replace them?`
					: `A file named '${firstName}' already exists in ${where}. Do you want to replace it?`,
				description: "This action is irreversible.",
				actions: [
					{
						label: many ? "Replace All" : "Replace",
						variant: "destructive",
						onClick: async () => {
							let replaced = 0;
							let replaceFailed = 0;
							for (const { relPath, file } of collisions) {
								if (!bridge.isCurrent(versionToken)) break;
								try {
									await writeOneFile(relPath, file, true);
									replaced += 1;
								} catch (error) {
									replaceFailed += 1;
									console.error("[v2 FilesTab] replace failed", {
										relPath,
										error,
									});
								}
							}
							if (!bridge.isCurrent(versionToken)) return;
							if (replaced > 0) {
								toast.success(
									replaced === 1
										? `Replaced 1 file in ${where}`
										: `Replaced ${replaced} files in ${where}`,
								);
							}
							if (replaceFailed > 0) {
								toast.error(
									replaceFailed === 1
										? "Failed to replace 1 file"
										: `Failed to replace ${replaceFailed} files`,
								);
							}
						},
					},
					{ label: "Cancel", variant: "ghost" },
				],
			});
		},
		[model, bridge, writeFile, createDirectory, rootPath, workspaceId],
	);

	const onDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
		if (!dragHasFiles(e)) return;
		e.preventDefault();
		e.stopPropagation();
		e.dataTransfer.dropEffect = "copy";
		// dragover fires continuously; bail out of state updates while the
		// destination (and its row position) is unchanged to avoid re-renders.
		const next = resolveDropTarget(e);
		setDropTarget((prev) => (targetsEqual(prev, next) ? prev : next));
	}, []);

	const onDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
		if (!dragHasFiles(e)) return;
		e.preventDefault();
		e.stopPropagation();
		// Ignore leaves into child rows — only clear when the cursor exits the
		// tree's bounds.
		const rect = e.currentTarget.getBoundingClientRect();
		const { clientX, clientY } = e;
		if (
			clientX < rect.left ||
			clientX > rect.right ||
			clientY < rect.top ||
			clientY > rect.bottom
		) {
			setDropTarget(null);
		}
	}, []);

	const onDrop = useCallback(
		(e: React.DragEvent<HTMLDivElement>) => {
			if (!dragHasFiles(e)) return;
			e.preventDefault();
			e.stopPropagation();
			setDropTarget(null);
			if (!rootPath || !workspaceId) return;

			// Read everything off the event synchronously — composedPath() and the
			// entry/file accessors are only valid during dispatch, before any await.
			const dirRel = resolveDropDirRel(e);
			const { entries, fallbackFiles } = collectDroppedEntries(e);

			if (entries.length === 0 && fallbackFiles.length === 0) {
				toast.error("Could not read the dropped files");
				return;
			}

			void uploadDropped(dirRel, entries, fallbackFiles);
		},
		[rootPath, workspaceId, uploadDropped],
	);

	return { dropTarget, onDragOver, onDragLeave, onDrop };
}
