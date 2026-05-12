import type { FileTree, FileTreeRenameEvent } from "@pierre/trees";
import { alert } from "@superset/ui/atoms/Alert";
import { toast } from "@superset/ui/sonner";
import { workspaceTrpc } from "@superset/workspace-client";
import { useCallback } from "react";
import {
	deriveCreationParent,
	pickPlaceholderName,
} from "../../utils/creationPaths";
import {
	asDirectoryHandle,
	basename,
	parentRel,
	stripTrailingSlash,
	toAbs,
	toRel,
} from "../../utils/treePath";
import type { FilesTabBridge } from "../useFilesTabBridge";

interface UseFilesTabActionsOptions {
	model: FileTree;
	bridge: FilesTabBridge;
	/** Workspace worktree root (absolute). */
	rootPath: string;
	workspaceId: string;
	/** Absolute path of the file currently open in the diff/editor pane, if any. */
	selectedFilePath: string | undefined;
	onSelectFile: (absolutePath: string, openInNewTab?: boolean) => void;
}

export interface FilesTabActions {
	/** Expand every ancestor directory of `absolutePath` then scroll the row into view. */
	reveal(absolutePath: string, isDirectory: boolean): Promise<void>;
	/** Start the inline "New file/folder" flow under `parentAbs` (or near the selection). */
	startCreating(mode: "file" | "folder", parentAbs?: string): Promise<void>;
	/** Commit a Pierre rename event — either finalizing a pending create or moving an existing path. */
	handleRename(event: FileTreeRenameEvent): Promise<void>;
	/** Confirm + delete a file/folder. */
	handleDelete(absolutePath: string, name: string, isDirectory: boolean): void;
	/** Collapse every expanded directory in the tree. */
	collapseAll(): void;
}

/**
 * Filesystem-mutating actions for the Files tab: create / rename / delete /
 * reveal / collapse-all. Owns the tRPC mutations and the bridge bookkeeping
 * dance (optimistic Pierre updates + workspace-switch race guards) so
 * `FilesTab` itself stays focused on wiring the tree.
 */
export function useFilesTabActions({
	model,
	bridge,
	rootPath,
	workspaceId,
	selectedFilePath,
	onSelectFile,
}: UseFilesTabActionsOptions): FilesTabActions {
	const writeFile = workspaceTrpc.filesystem.writeFile.useMutation();
	const createDirectory =
		workspaceTrpc.filesystem.createDirectory.useMutation();
	const movePath = workspaceTrpc.filesystem.movePath.useMutation();
	const deletePath = workspaceTrpc.filesystem.deletePath.useMutation();

	const reveal = useCallback(
		async (absolutePath: string, isDirectory: boolean): Promise<void> => {
			if (!rootPath || !absolutePath.startsWith(rootPath)) return;
			const rel = toRel(rootPath, absolutePath);
			if (!rel) return;

			// Always wait on the root listing before focusPath. For root-level
			// files the ancestor loop runs zero iterations, so without this
			// we'd race the initial fetch and the reveal silently no-ops.
			// fetchDir is idempotent + cached, so this is free after first call.
			await bridge.fetchDir("");

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
			// Snapshot before any await so post-mutation cleanup against a
			// stale workspace (user switched mid-flight) bails out instead of
			// leaking source/destination paths into the new workspace's
			// knownPaths / model.
			const versionToken = bridge.getVersion();

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
						if (bridge.isCurrent(versionToken)) onSelectFile(absPath);
					}
				} catch (error) {
					if (!bridge.isCurrent(versionToken)) return;
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

			// Genuine rename. Pierre has already moved the entry on its side.
			// For folders, also rekey every cached descendant (knownPaths +
			// loadedDirs) under the new prefix so later fs reconciliation /
			// reveals don't target stale paths.
			bridge.knownPaths.delete(sourcePath);
			bridge.knownPaths.add(destinationPath);
			if (isFolder) {
				bridge.rekeyDescendants(
					stripTrailingSlash(sourcePath),
					stripTrailingSlash(destinationPath),
				);
			}
			try {
				await movePath.mutateAsync({
					workspaceId,
					sourceAbsolutePath: toAbs(rootPath, sourcePath),
					destinationAbsolutePath: toAbs(rootPath, destinationPath),
				});
			} catch (error) {
				if (!bridge.isCurrent(versionToken)) return;
				// Revert Pierre's optimistic rename.
				try {
					model.move(destinationPath, sourcePath);
					bridge.knownPaths.delete(destinationPath);
					bridge.knownPaths.add(sourcePath);
					if (isFolder) {
						bridge.rekeyDescendants(
							stripTrailingSlash(destinationPath),
							stripTrailingSlash(sourcePath),
						);
					}
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
								deletePath.mutateAsync({ workspaceId, absolutePath }),
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

	const collapseAll = useCallback(() => {
		for (const path of bridge.knownPaths) {
			if (!path.endsWith("/")) continue;
			const handle = asDirectoryHandle(model.getItem(path));
			if (handle?.isExpanded()) {
				handle.collapse();
			}
		}
	}, [model, bridge.knownPaths]);

	return { reveal, startCreating, handleRename, handleDelete, collapseAll };
}
