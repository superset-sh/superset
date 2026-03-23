import { toast } from "@superset/ui/sonner";
import { useCallback } from "react";
import { electronTrpc } from "renderer/lib/electron-trpc";
import type { DirectoryEntry } from "shared/file-tree-types";
import { getParentPath } from "../../utils/new-item-paths";

interface UseFileTreePasteProps {
	workspaceId: string | undefined;
	worktreePath: string | undefined;
	selectedEntry: DirectoryEntry | null;
}

function isWithinRoot(filePath: string, rootPath: string): boolean {
	const normalized = rootPath.endsWith("/") ? rootPath : `${rootPath}/`;
	return filePath === rootPath || filePath.startsWith(normalized);
}

function resolveTargetFolder(
	selectedEntry: DirectoryEntry | null,
	worktreePath: string,
): string {
	if (!selectedEntry) return worktreePath;
	if (selectedEntry.isDirectory) return selectedEntry.path;
	return getParentPath(selectedEntry.path) || worktreePath;
}

export function useFileTreePaste({
	workspaceId,
	worktreePath,
	selectedEntry,
}: UseFileTreePasteProps) {
	const importMutation =
		electronTrpc.filesystem.importExternalFiles.useMutation();
	const copyPathMutation = electronTrpc.filesystem.copyPath.useMutation();
	const trpcUtils = electronTrpc.useUtils();

	const handlePaste = useCallback(
		async (e: React.KeyboardEvent) => {
			const isMac = navigator.platform.includes("Mac");
			const isCtrlOrCmd = isMac ? e.metaKey : e.ctrlKey;

			if (!isCtrlOrCmd || e.key !== "v") return;
			if (!workspaceId || !worktreePath) return;

			e.preventDefault();

			let clipboardPaths: string[];
			try {
				clipboardPaths =
					await trpcUtils.external.readClipboardFilePaths.fetch();
			} catch (error) {
				console.warn(
					"[useFileTreePaste] Failed to read clipboard file paths:",
					error,
				);
				return;
			}

			if (clipboardPaths.length === 0) return;

			const destinationPath = resolveTargetFolder(selectedEntry, worktreePath);

			const externalPaths = clipboardPaths.filter(
				(p) => !isWithinRoot(p, worktreePath),
			);
			const internalPaths = clipboardPaths.filter((p) =>
				isWithinRoot(p, worktreePath),
			);

			const promises: Promise<unknown>[] = [];

			if (externalPaths.length > 0) {
				promises.push(
					importMutation.mutateAsync({
						workspaceId,
						sourcePaths: externalPaths,
						destinationDirectoryPath: destinationPath,
					}),
				);
			}

			if (internalPaths.length > 0) {
				for (const sourcePath of internalPaths) {
					const baseName = sourcePath.split("/").pop() ?? sourcePath;
					promises.push(
						copyPathMutation.mutateAsync({
							workspaceId,
							sourceAbsolutePath: sourcePath,
							destinationAbsolutePath: `${destinationPath}/${baseName}`,
						}),
					);
				}
			}

			try {
				await Promise.all(promises);
				const total = clipboardPaths.length;
				toast.success(total === 1 ? "Pasted file" : `Pasted ${total} files`);
			} catch (error) {
				toast.error(
					`Failed to paste: ${error instanceof Error ? error.message : "Unknown error"}`,
				);
			}
		},
		[
			workspaceId,
			worktreePath,
			selectedEntry,
			importMutation,
			copyPathMutation,
			trpcUtils,
		],
	);

	return { handlePaste };
}
