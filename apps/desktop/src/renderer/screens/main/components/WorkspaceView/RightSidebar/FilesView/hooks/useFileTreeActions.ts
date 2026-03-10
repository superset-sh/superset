import { toast } from "@superset/ui/sonner";
import { useCallback } from "react";
import { electronTrpc } from "renderer/lib/electron-trpc";

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
	const createFileMutation = electronTrpc.filesystem.createFile.useMutation({
		onSuccess: (data, variables) => {
			toast.success(`Created ${data.path.split("/").pop()}`);
			onRefresh(variables.parentAbsolutePath);
		},
		onError: (error) => {
			toast.error(`Failed to create file: ${error.message}`);
		},
	});

	const createDirectoryMutation =
		electronTrpc.filesystem.createDirectory.useMutation({
			onSuccess: (data, variables) => {
				toast.success(`Created ${data.path.split("/").pop()}`);
				onRefresh(variables.parentAbsolutePath);
			},
			onError: (error) => {
				toast.error(`Failed to create folder: ${error.message}`);
			},
		});

	const renameMutation = electronTrpc.filesystem.rename.useMutation({
		onSuccess: (data, variables) => {
			toast.success(`Renamed to ${data.newPath.split("/").pop()}`);
			const parentPath = variables.absolutePath
				.split("/")
				.slice(0, -1)
				.join("/");
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
			const firstPath = variables.absolutePaths[0];
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
			onRefresh(variables.destinationAbsolutePath);
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
			onRefresh(variables.destinationAbsolutePath);
		},
		onError: (error) => {
			toast.error(`Failed to copy: ${error.message}`);
		},
	});

	const createFile = useCallback(
		(parentAbsolutePath: string, name: string, content = "") => {
			if (!workspaceId) return;
			createFileMutation.mutate({
				workspaceId,
				parentAbsolutePath,
				name,
				content,
			});
		},
		[createFileMutation, workspaceId],
	);

	const createDirectory = useCallback(
		(parentAbsolutePath: string, name: string) => {
			if (!workspaceId) return;
			createDirectoryMutation.mutate({
				workspaceId,
				parentAbsolutePath,
				name,
			});
		},
		[createDirectoryMutation, workspaceId],
	);

	const rename = useCallback(
		(absolutePath: string, newName: string) => {
			if (!workspaceId) return;
			renameMutation.mutate({ workspaceId, absolutePath, newName });
		},
		[renameMutation, workspaceId],
	);

	const deleteItems = useCallback(
		(absolutePaths: string[], permanent = false) => {
			if (!workspaceId) return;
			deleteMutation.mutate({ workspaceId, absolutePaths, permanent });
		},
		[deleteMutation, workspaceId],
	);

	const moveItems = useCallback(
		(sourceAbsolutePaths: string[], destinationAbsolutePath: string) => {
			if (!workspaceId) return;
			moveMutation.mutate({
				workspaceId,
				sourceAbsolutePaths,
				destinationAbsolutePath,
			});
		},
		[moveMutation, workspaceId],
	);

	const copyItems = useCallback(
		(sourceAbsolutePaths: string[], destinationAbsolutePath: string) => {
			if (!workspaceId) return;
			copyMutation.mutate({
				workspaceId,
				sourceAbsolutePaths,
				destinationAbsolutePath,
			});
		},
		[copyMutation, workspaceId],
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
