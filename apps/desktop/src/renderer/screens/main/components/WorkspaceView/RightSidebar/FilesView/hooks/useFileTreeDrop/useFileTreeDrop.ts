import { toast } from "@superset/ui/sonner";
import { useCallback, useRef, useState } from "react";
import { electronTrpc } from "renderer/lib/electron-trpc";
import type { DirectoryEntry } from "shared/file-tree-types";
import { getParentPath } from "../../utils/new-item-paths";

const FILE_PATH_MIME = "application/x-superset-file-path";

interface UseFileTreeDropProps {
	workspaceId: string | undefined;
	worktreePath: string | undefined;
	moveItems: (sourcePaths: string[], destPath: string) => void;
	copyItems: (sourcePaths: string[], destPath: string) => void;
	onRefresh: (parentPath: string) => void;
}

function resolveTargetFolder(
	entry: DirectoryEntry,
	worktreePath: string,
): string {
	if (entry.isDirectory) return entry.path;
	const parent = getParentPath(entry.path);
	return parent !== entry.path ? parent : worktreePath;
}

function isDescendantOf(childPath: string, parentPath: string): boolean {
	const normalized = parentPath.endsWith("/") ? parentPath : `${parentPath}/`;
	return childPath === parentPath || childPath.startsWith(normalized);
}

export function useFileTreeDrop({
	workspaceId,
	worktreePath,
	moveItems,
	copyItems,
	onRefresh,
}: UseFileTreeDropProps) {
	const [dropTargetPath, setDropTargetPath] = useState<string | null>(null);
	const dragCounterRef = useRef(0);
	const rootDragCounterRef = useRef(0);

	const importMutation =
		electronTrpc.filesystem.importExternalFiles.useMutation();

	const handleImportExternal = useCallback(
		(files: FileList, destinationPath: string) => {
			if (!workspaceId) return;

			const sourcePaths: string[] = [];
			for (const file of Array.from(files)) {
				try {
					const filePath = window.webUtils.getPathForFile(file);
					if (filePath) sourcePaths.push(filePath);
				} catch (error) {
					console.warn(
						"[useFileTreeDrop] Failed to get path for dropped file:",
						file.name,
						error,
					);
				}
			}

			if (sourcePaths.length === 0) return;

			importMutation.mutate(
				{
					workspaceId,
					sourcePaths,
					destinationDirectoryPath: destinationPath,
				},
				{
					onSuccess: (result) => {
						const count = result.imported.length;
						toast.success(
							count === 1 ? "Imported file" : `Imported ${count} files`,
						);
						onRefresh(destinationPath);
					},
					onError: (error) => {
						toast.error(`Failed to import: ${error.message}`);
					},
				},
			);
		},
		[workspaceId, importMutation, onRefresh],
	);

	const handleInternalDrop = useCallback(
		(e: React.DragEvent, destinationPath: string) => {
			const sourcePath = e.dataTransfer.getData(FILE_PATH_MIME);
			if (!sourcePath) return;

			// Prevent dropping onto self or descendant
			if (isDescendantOf(destinationPath, sourcePath)) {
				return;
			}

			if (e.altKey) {
				copyItems([sourcePath], destinationPath);
			} else {
				moveItems([sourcePath], destinationPath);
			}
		},
		[moveItems, copyItems],
	);

	const getItemDropProps = useCallback(
		(entry: DirectoryEntry) => {
			const targetFolder = worktreePath
				? resolveTargetFolder(entry, worktreePath)
				: null;

			return {
				onDragEnter: (e: React.DragEvent) => {
					e.preventDefault();
					e.stopPropagation();
					dragCounterRef.current += 1;
					if (targetFolder) {
						setDropTargetPath(targetFolder);
					}
				},
				onDragOver: (e: React.DragEvent) => {
					e.preventDefault();
					e.stopPropagation();
					const isExternal = e.dataTransfer.types.includes("Files");
					e.dataTransfer.dropEffect = isExternal
						? "copy"
						: e.altKey
							? "copy"
							: "move";
				},
				onDragLeave: (e: React.DragEvent) => {
					e.preventDefault();
					e.stopPropagation();
					dragCounterRef.current -= 1;
					if (dragCounterRef.current <= 0) {
						dragCounterRef.current = 0;
						setDropTargetPath(null);
					}
				},
				onDrop: (e: React.DragEvent) => {
					e.preventDefault();
					e.stopPropagation();
					dragCounterRef.current = 0;
					setDropTargetPath(null);

					if (!targetFolder) return;

					const isExternal = e.dataTransfer.types.includes("Files");
					if (isExternal) {
						handleImportExternal(e.dataTransfer.files, targetFolder);
					} else {
						handleInternalDrop(e, targetFolder);
					}
				},
			};
		},
		[worktreePath, handleImportExternal, handleInternalDrop],
	);

	const getRootDropProps = useCallback(() => {
		return {
			onDragEnter: (e: React.DragEvent) => {
				e.preventDefault();
				rootDragCounterRef.current += 1;
				if (worktreePath && !dropTargetPath) {
					setDropTargetPath(worktreePath);
				}
			},
			onDragOver: (e: React.DragEvent) => {
				e.preventDefault();
				const isExternal = e.dataTransfer.types.includes("Files");
				e.dataTransfer.dropEffect = isExternal
					? "copy"
					: e.altKey
						? "copy"
						: "move";
			},
			onDragLeave: (e: React.DragEvent) => {
				e.preventDefault();
				rootDragCounterRef.current -= 1;
				if (rootDragCounterRef.current <= 0) {
					rootDragCounterRef.current = 0;
					setDropTargetPath(null);
				}
			},
			onDrop: (e: React.DragEvent) => {
				e.preventDefault();
				rootDragCounterRef.current = 0;
				setDropTargetPath(null);

				if (!worktreePath) return;

				const isExternal = e.dataTransfer.types.includes("Files");
				if (isExternal) {
					handleImportExternal(e.dataTransfer.files, worktreePath);
				} else {
					handleInternalDrop(e, worktreePath);
				}
			},
		};
	}, [worktreePath, dropTargetPath, handleImportExternal, handleInternalDrop]);

	return {
		dropTargetPath,
		getItemDropProps,
		getRootDropProps,
	};
}
