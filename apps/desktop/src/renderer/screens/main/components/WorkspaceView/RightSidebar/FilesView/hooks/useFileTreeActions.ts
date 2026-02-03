import { toast } from "@superset/ui/sonner";
import { useCallback } from "react";
import { electronTrpc } from "renderer/lib/electron-trpc";

interface UseFileTreeActionsProps {
	worktreePath: string | undefined;
	onRefresh: (parentPath: string) => void | Promise<void>;
}

export function useFileTreeActions({
	worktreePath,
	onRefresh,
}: UseFileTreeActionsProps) {
	const createFileMutation = electronTrpc.filesystem.createFile.useMutation({
		onSuccess: (data, variables) => {
			toast.success(`Created ${data.path.split("/").pop()}`);
			onRefresh(variables.dirPath);
		},
		onError: (error) => {
			toast.error(`Failed to create file: ${error.message}`);
		},
	});

	const createDirectoryMutation =
		electronTrpc.filesystem.createDirectory.useMutation({
			onSuccess: (data, variables) => {
				toast.success(`Created ${data.path.split("/").pop()}`);
				onRefresh(variables.parentPath);
			},
			onError: (error) => {
				toast.error(`Failed to create folder: ${error.message}`);
			},
		});

	const renameMutation = electronTrpc.filesystem.rename.useMutation({
		onSuccess: (data, variables) => {
			toast.success(`Renamed to ${data.newPath.split("/").pop()}`);
			const parentPath = variables.oldPath.split("/").slice(0, -1).join("/");
			onRefresh(parentPath || worktreePath || "");
		},
		onError: (error) => {
			toast.error(`Failed to rename: ${error.message}`);
		},
	});

	const deleteMutation = electronTrpc.filesystem.delete.useMutation({
		onSuccess: (data, variables) => {
			const count = data.deleted.length;
			if (count === 1) {
				toast.success(`Moved to trash`);
			} else {
				toast.success(`Moved ${count} items to trash`);
			}
			if (data.errors.length > 0) {
				toast.error(`Failed to delete ${data.errors.length} items`);
			}
			const firstPath = variables.paths[0];
			const parentPath = firstPath?.split("/").slice(0, -1).join("/");
			onRefresh(parentPath || worktreePath || "");
		},
		onError: (error) => {
			toast.error(`Failed to delete: ${error.message}`);
		},
	});

	const moveMutation = electronTrpc.filesystem.move.useMutation({
		onSuccess: (data, variables) => {
			const count = data.moved.length;
			if (count === 1) {
				toast.success(`Moved ${data.moved[0].to.split("/").pop()}`);
			} else {
				toast.success(`Moved ${count} items`);
			}
			if (data.errors.length > 0) {
				toast.error(`Failed to move ${data.errors.length} items`);
			}
			onRefresh(variables.destinationDir);
		},
		onError: (error) => {
			toast.error(`Failed to move: ${error.message}`);
		},
	});

	const copyMutation = electronTrpc.filesystem.copy.useMutation({
		onSuccess: (data, variables) => {
			const count = data.copied.length;
			if (count === 1) {
				toast.success(`Copied ${data.copied[0].to.split("/").pop()}`);
			} else {
				toast.success(`Copied ${count} items`);
			}
			if (data.errors.length > 0) {
				toast.error(`Failed to copy ${data.errors.length} items`);
			}
			onRefresh(variables.destinationDir);
		},
		onError: (error) => {
			toast.error(`Failed to copy: ${error.message}`);
		},
	});

	const createFile = useCallback(
		(dirPath: string, fileName: string, content = "") => {
			createFileMutation.mutate({ dirPath, fileName, content });
		},
		[createFileMutation],
	);

	const createDirectory = useCallback(
		(parentPath: string, dirName: string) => {
			createDirectoryMutation.mutate({ parentPath, dirName });
		},
		[createDirectoryMutation],
	);

	const rename = useCallback(
		(oldPath: string, newName: string) => {
			renameMutation.mutate({ oldPath, newName });
		},
		[renameMutation],
	);

	const deleteItems = useCallback(
		(paths: string[], permanent = false) => {
			deleteMutation.mutate({ paths, permanent });
		},
		[deleteMutation],
	);

	const moveItems = useCallback(
		(sourcePaths: string[], destinationDir: string) => {
			moveMutation.mutate({ sourcePaths, destinationDir });
		},
		[moveMutation],
	);

	const copyItems = useCallback(
		(sourcePaths: string[], destinationDir: string) => {
			copyMutation.mutate({ sourcePaths, destinationDir });
		},
		[copyMutation],
	);

	return {
		createFile,
		createDirectory,
		rename,
		deleteItems,
		moveItems,
		copyItems,
		isCreatingFile: createFileMutation.isPending,
		isCreatingDirectory: createDirectoryMutation.isPending,
		isRenaming: renameMutation.isPending,
		isDeleting: deleteMutation.isPending,
		isMoving: moveMutation.isPending,
		isCopying: copyMutation.isPending,
	};
}
