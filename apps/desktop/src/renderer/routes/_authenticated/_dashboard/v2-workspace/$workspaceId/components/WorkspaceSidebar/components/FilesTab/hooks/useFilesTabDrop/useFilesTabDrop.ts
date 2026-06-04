import type { FileTree } from "@pierre/trees";
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

export interface FilesTabDropTarget {
	/** Relative directory the dropped files write into. "" = worktree root. */
	dirRel: string;
	/** Human label for the overlay — folder basename, or "workspace root". */
	label: string;
}

export interface FilesTabDrop {
	/** Non-null while an external file drag hovers the tree. */
	dropTarget: FilesTabDropTarget | null;
	onDragOver(e: React.DragEvent<HTMLDivElement>): void;
	onDragLeave(e: React.DragEvent<HTMLDivElement>): void;
	onDrop(e: React.DragEvent<HTMLDivElement>): void;
}

/** True when the drag carries OS files (vs. an internal/text drag). */
function dragHasFiles(e: React.DragEvent): boolean {
	return Array.from(e.dataTransfer.types).includes("Files");
}

/**
 * Resolve which directory a drag is over by walking `composedPath()` for the
 * nearest row's `data-item-path` (stamped by `@pierre/trees`, lives in an open
 * shadow root). Directory rows carry a trailing slash → drop into that folder;
 * file rows → drop into their parent; nothing under the cursor → worktree root.
 */
function resolveDropDirRel(e: React.DragEvent): string {
	for (const node of e.nativeEvent.composedPath()) {
		if (!(node instanceof HTMLElement)) continue;
		const itemPath = node.getAttribute("data-item-path");
		if (itemPath) {
			return itemPath.endsWith("/")
				? stripTrailingSlash(itemPath)
				: parentRel(itemPath);
		}
	}
	return "";
}

function dirLabel(dirRel: string): string {
	return dirRel === "" ? "workspace root" : basename(dirRel);
}

/**
 * Collect droppable files, skipping directories. We deliberately read the
 * `File` objects (not OS paths) because the host-service filesystem is
 * sandboxed to the worktree — an external source path would be rejected, and a
 * path means nothing for a remote workspace. Directory detection uses the entry
 * API; folders are reported separately since recursive upload isn't supported.
 *
 * Must run synchronously inside the drop handler: `getAsFile` /
 * `webkitGetAsEntry` are only valid during event dispatch.
 */
function collectDroppedFiles(e: React.DragEvent): {
	files: File[];
	skippedDirs: number;
} {
	const items = Array.from(e.dataTransfer.items);
	const supportsEntries =
		items.length > 0 && typeof items[0].webkitGetAsEntry === "function";

	if (!supportsEntries) {
		return { files: Array.from(e.dataTransfer.files), skippedDirs: 0 };
	}

	const files: File[] = [];
	let skippedDirs = 0;
	for (const item of items) {
		if (item.kind !== "file") continue;
		if (item.webkitGetAsEntry()?.isDirectory) {
			skippedDirs += 1;
			continue;
		}
		const file = item.getAsFile();
		if (file) files.push(file);
	}
	return { files, skippedDirs };
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
 * Drag-and-drop file upload for the v2 Files tab. Dropping OS files onto a
 * folder row writes them into that folder (onto a file row → its parent, onto
 * empty space → the worktree root). Each file's bytes are read in the renderer
 * and written via `filesystem.writeFile` (base64) — the host sandboxes write
 * destinations to the worktree but never sees an external source path, so this
 * works for both local and remote workspaces. New entries surface through the
 * bridge's `fs:events` reconciliation; we also expand + fetch the destination
 * so they appear without a manual refresh.
 */
export function useFilesTabDrop({
	model,
	bridge,
	rootPath,
	workspaceId,
}: UseFilesTabDropOptions): FilesTabDrop {
	const writeFile = workspaceTrpc.filesystem.writeFile.useMutation();
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

	const uploadFiles = useCallback(
		async (
			dirRel: string,
			files: File[],
			skippedDirs: number,
		): Promise<void> => {
			const destDirAbs = toAbs(rootPath, dirRel);
			const versionToken = bridge.getVersion();

			// Upload one file at a time: encoding everything up front would hold
			// every base64 payload (~1.33x each) in memory at once, and a per-file
			// version check lets a workspace switch stop the remaining writes
			// instead of dribbling them into a worktree the user has left.
			let added = 0;
			let failed = 0;
			for (const file of files) {
				if (!bridge.isCurrent(versionToken)) break;
				try {
					const data = await fileToBase64(file);
					const result = await writeFile.mutateAsync({
						workspaceId,
						absolutePath: `${destDirAbs}/${file.name}`,
						content: { kind: "base64", data },
						options: { create: true, overwrite: false },
					});
					// The host resolves "already exists" to `{ ok: false }` rather
					// than throwing — surface it as a failure for this file.
					if (result && result.ok === false) {
						throw new Error(result.reason ?? "write failed");
					}
					added += 1;
				} catch {
					failed += 1;
				}
			}

			// User switched workspaces mid-upload — don't toast/expand against the
			// new tree.
			if (!bridge.isCurrent(versionToken)) return;

			if (added > 0) {
				const where = dirLabel(dirRel);
				toast.success(
					added === 1
						? `Added 1 file to ${where}`
						: `Added ${added} files to ${where}`,
				);
				// Surface the new entries immediately. fs:events also reconciles,
				// but expanding + fetching avoids waiting on the watcher and shows
				// results inside a collapsed destination folder.
				if (dirRel) {
					const handle = asDirectoryHandle(model.getItem(`${dirRel}/`));
					if (handle && !handle.isExpanded()) handle.expand();
				}
				void bridge.fetchDir(dirRel);
			}
			if (failed > 0) {
				toast.error(
					failed === 1
						? "Failed to add 1 file"
						: `Failed to add ${failed} files`,
				);
			}
			if (skippedDirs > 0) {
				toast.info(
					skippedDirs === 1
						? "Skipped a folder — only files can be dropped"
						: `Skipped ${skippedDirs} folders — only files can be dropped`,
				);
			}
		},
		[model, bridge, writeFile, rootPath, workspaceId],
	);

	const onDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
		if (!dragHasFiles(e)) return;
		e.preventDefault();
		e.stopPropagation();
		e.dataTransfer.dropEffect = "copy";
		const dirRel = resolveDropDirRel(e);
		setDropTarget({ dirRel, label: dirLabel(dirRel) });
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
			const { files, skippedDirs } = collectDroppedFiles(e);

			if (files.length === 0) {
				toast.error(
					skippedDirs > 0
						? "Only files can be dropped, not folders"
						: "Could not read the dropped files",
				);
				return;
			}

			void uploadFiles(dirRel, files, skippedDirs);
		},
		[rootPath, workspaceId, uploadFiles],
	);

	return { dropTarget, onDragOver, onDragLeave, onDrop };
}
