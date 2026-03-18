import { toast } from "@superset/ui/sonner";
import { useCallback } from "react";
import { electronTrpc } from "renderer/lib/electron-trpc";
import {
	getBaseName,
	getParentPath,
	joinAbsolutePath,
	resolveNewDirectoryTarget,
	resolveNewFileTarget,
} from "../utils/new-item-paths";

interface UseFileTreeActionsProps {
	workspaceId: string | undefined;
	worktreePath: string | undefined;
	onRefresh: (parentPath: string) => void | Promise<void>;
}

export function useFileTreeActions({
	workspaceId,
	worktreePath,
	onRefresh,
}: UseFileTreeActionsProps) {
	const writeFileMutation = electronTrpc.filesystem.writeFile.useMutation();
	const createDirectoryMutation =
		electronTrpc.filesystem.createDirectory.useMutation();
	const movePathMutation = electronTrpc.filesystem.movePath.useMutation();
	const deletePathMutation = electronTrpc.filesystem.deletePath.useMutation();
	const copyPathMutation = electronTrpc.filesystem.copyPath.useMutation();

	const createFile = useCallback(
		(parentAbsolutePath: string, name: string, content = "") => {
			if (!workspaceId) {
				return;
			}

			const fileTarget = resolveNewFileTarget(parentAbsolutePath, name);
			if (!fileTarget) {
				toast.error(
					"Failed to create file: nested paths cannot contain . or ..",
				);
				return;
			}

			void (
				fileTarget.targetParentPath !== parentAbsolutePath
					? createDirectoryMutation.mutateAsync({
							workspaceId,
							absolutePath: fileTarget.targetParentPath,
							recursive: true,
						})
					: Promise.resolve()
			)
				.then(() =>
					writeFileMutation.mutateAsync({
						workspaceId,
						absolutePath: fileTarget.absolutePath,
						content,
						encoding: "utf-8",
						options: { create: true, overwrite: false },
					}),
				)
				.then((result) => {
					if (!result.ok) {
						if (result.reason === "exists") {
							toast.error(`Failed to create file: ${name} already exists`);
							return;
						}
						toast.error(`Failed to create file: ${result.reason}`);
						return;
					}

					toast.success(`Created ${name}`);
					void onRefresh(parentAbsolutePath);
				})
				.catch((error: Error) => {
					toast.error(`Failed to create file: ${error.message}`);
				});
		},
		[createDirectoryMutation, onRefresh, workspaceId, writeFileMutation],
	);

	const createDirectory = useCallback(
		(parentAbsolutePath: string, name: string) => {
			if (!workspaceId) {
				return;
			}

			const directoryTarget = resolveNewDirectoryTarget(
				parentAbsolutePath,
				name,
			);
			if (!directoryTarget) {
				toast.error(
					"Failed to create folder: nested paths cannot contain . or ..",
				);
				return;
			}
			void createDirectoryMutation
				.mutateAsync({
					workspaceId,
					absolutePath: directoryTarget.absolutePath,
					recursive: true,
				})
				.then(() => {
					toast.success(`Created ${name}`);
					void onRefresh(parentAbsolutePath);
				})
				.catch((error: Error) => {
					toast.error(`Failed to create folder: ${error.message}`);
				});
		},
		[createDirectoryMutation, onRefresh, workspaceId],
	);

	const rename = useCallback(
		(absolutePath: string, newName: string) => {
			if (!workspaceId) {
				return;
			}

			const destinationAbsolutePath = joinAbsolutePath(
				getParentPath(absolutePath),
				newName,
			);
			void movePathMutation
				.mutateAsync({
					workspaceId,
					sourceAbsolutePath: absolutePath,
					destinationAbsolutePath,
				})
				.then(() => {
					toast.success(`Renamed to ${newName}`);
					void onRefresh(getParentPath(absolutePath) || worktreePath || "");
				})
				.catch((error: Error) => {
					toast.error(`Failed to rename: ${error.message}`);
				});
		},
		[movePathMutation, onRefresh, workspaceId, worktreePath],
	);

	const deleteItems = useCallback(
		(absolutePaths: string[], permanent = false) => {
			if (!workspaceId || absolutePaths.length === 0) {
				return;
			}

			void Promise.allSettled(
				absolutePaths.map((absolutePath) =>
					deletePathMutation.mutateAsync({
						workspaceId,
						absolutePath,
						permanent,
					}),
				),
			).then((results) => {
				const deletedCount = results.filter(
					(result) => result.status === "fulfilled",
				).length;
				const errorCount = results.length - deletedCount;

				if (deletedCount > 0) {
					toast.success(
						deletedCount === 1
							? permanent
								? "Deleted"
								: "Moved to trash"
							: permanent
								? `Deleted ${deletedCount} items`
								: `Moved ${deletedCount} items to trash`,
					);
				}

				if (errorCount > 0) {
					toast.error(`Failed to delete ${errorCount} items`);
				}

				const parentPath = getParentPath(absolutePaths[0]);
				void onRefresh(parentPath || worktreePath || "");
			});
		},
		[deletePathMutation, onRefresh, workspaceId, worktreePath],
	);

	const moveItems = useCallback(
		(sourceAbsolutePaths: string[], destinationAbsolutePath: string) => {
			if (!workspaceId || sourceAbsolutePaths.length === 0) {
				return;
			}

			void Promise.allSettled(
				sourceAbsolutePaths.map((sourceAbsolutePath) =>
					movePathMutation.mutateAsync({
						workspaceId,
						sourceAbsolutePath,
						destinationAbsolutePath: joinAbsolutePath(
							destinationAbsolutePath,
							getBaseName(sourceAbsolutePath),
						),
					}),
				),
			).then((results) => {
				const movedCount = results.filter(
					(result) => result.status === "fulfilled",
				).length;
				const errorCount = results.length - movedCount;

				if (movedCount > 0) {
					toast.success(
						movedCount === 1 ? "Moved item" : `Moved ${movedCount} items`,
					);
				}

				if (errorCount > 0) {
					toast.error(`Failed to move ${errorCount} items`);
				}

				void onRefresh(destinationAbsolutePath);
			});
		},
		[movePathMutation, onRefresh, workspaceId],
	);

	const copyItems = useCallback(
		(sourceAbsolutePaths: string[], destinationAbsolutePath: string) => {
			if (!workspaceId || sourceAbsolutePaths.length === 0) {
				return;
			}

			void Promise.allSettled(
				sourceAbsolutePaths.map((sourceAbsolutePath) =>
					copyPathMutation.mutateAsync({
						workspaceId,
						sourceAbsolutePath,
						destinationAbsolutePath: joinAbsolutePath(
							destinationAbsolutePath,
							getBaseName(sourceAbsolutePath),
						),
					}),
				),
			).then((results) => {
				const copiedCount = results.filter(
					(result) => result.status === "fulfilled",
				).length;
				const errorCount = results.length - copiedCount;

				if (copiedCount > 0) {
					toast.success(
						copiedCount === 1 ? "Copied item" : `Copied ${copiedCount} items`,
					);
				}

				if (errorCount > 0) {
					toast.error(`Failed to copy ${errorCount} items`);
				}

				void onRefresh(destinationAbsolutePath);
			});
		},
		[copyPathMutation, onRefresh, workspaceId],
	);

	return {
		createFile,
		createDirectory,
		rename,
		deleteItems,
		moveItems,
		copyItems,
		isCreatingFile: writeFileMutation.isPending,
		isCreatingDirectory: createDirectoryMutation.isPending,
		isRenaming: movePathMutation.isPending,
		isDeleting: deletePathMutation.isPending,
		isMoving: movePathMutation.isPending,
		isCopying: copyPathMutation.isPending,
	};
}
