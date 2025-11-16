import { useCallback, useEffect, useRef, useState } from "react";
import type { DiffViewData, FileDiff } from "../components/DiffView/types";

interface UseDiffDataProps {
	workspaceId: string | undefined;
	worktreeId: string | null | undefined;
	worktreeBranch?: string;
	workspaceName?: string;
	enabled: boolean;
}

export function useDiffData({
	workspaceId,
	worktreeId,
	worktreeBranch,
	workspaceName,
	enabled,
}: UseDiffDataProps) {
	const [loading, setLoading] = useState(false);
	const [refreshing, setRefreshing] = useState(false);
	const [diffData, setDiffData] = useState<DiffViewData | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [loadedFiles, setLoadedFiles] = useState<Set<string>>(new Set());
	const [loadingFiles, setLoadingFiles] = useState<Set<string>>(new Set());
	const loadedFilesRef = useRef<Set<string>>(new Set());
	const loadingFilesRef = useRef<Set<string>>(new Set());

	// Load file list first (non-blocking)
	const loadFileList = useCallback(
		async (isRefresh = false) => {
			if (!enabled || !workspaceId || !worktreeId) {
				setDiffData(null);
				setError(null);
				setLoadedFiles(new Set());
				setLoadingFiles(new Set());
				loadedFilesRef.current = new Set();
				loadingFilesRef.current = new Set();
				return;
			}

			if (isRefresh) {
				setRefreshing(true);
			} else {
				setLoading(true);
			}
			setError(null);

			try {
				const result = await window.ipcRenderer.invoke(
					"worktree-get-git-diff-file-list",
					{
						workspaceId,
						worktreeId,
					},
				);

				if (
					result &&
					typeof result === "object" &&
					"success" in result &&
					result.success &&
					"files" in result &&
					result.files
				) {
					// Transform to DiffViewData format with empty changes arrays
					const files: FileDiff[] = result.files.map((file) => ({
						...file,
						changes: [], // Will be loaded lazily
					}));

					const diffViewData: DiffViewData = {
						title: `Changes in ${worktreeBranch || "worktree"}`,
						description: workspaceName
							? `Workspace: ${workspaceName}`
							: undefined,
						timestamp: new Date().toLocaleString(),
						files,
					};
					setDiffData(diffViewData);
					setLoadedFiles(new Set()); // Reset loaded files when list refreshes
					loadedFilesRef.current = new Set();
					loadingFilesRef.current = new Set();
				} else {
					const errorMsg =
						result && typeof result === "object" && "error" in result
							? result.error
							: "Failed to load diff";
					setError(errorMsg || "Failed to load diff");
				}
			} catch (err) {
				setError(err instanceof Error ? err.message : "Unknown error");
			} finally {
				if (isRefresh) {
					setRefreshing(false);
				} else {
					setLoading(false);
				}
			}
		},
		[enabled, workspaceId, worktreeId, worktreeBranch, workspaceName],
	);

	// Load individual file content lazily
	const loadFileContent = useCallback(
		async (fileId: string) => {
			if (!diffData || !workspaceId || !worktreeId) return;

			// Check if already loaded or loading using refs
			if (
				loadedFilesRef.current.has(fileId) ||
				loadingFilesRef.current.has(fileId)
			) {
				return;
			}

			// Mark as loading
			loadingFilesRef.current.add(fileId);
			setLoadingFiles(new Set(loadingFilesRef.current));

			const file = diffData.files.find((f) => f.id === fileId);
			if (!file) {
				loadingFilesRef.current.delete(fileId);
				setLoadingFiles(new Set(loadingFilesRef.current));
				return;
			}

			try {
				const result = await window.ipcRenderer.invoke(
					"worktree-get-git-diff-file",
					{
						workspaceId,
						worktreeId,
						filePath: file.filePath,
						oldPath: file.oldPath,
						status: file.status,
					},
				);

				if (
					result &&
					typeof result === "object" &&
					"success" in result &&
					result.success &&
					"changes" in result &&
					result.changes
				) {
					// Update the file with loaded changes
					setDiffData((prev) => {
						if (!prev) return prev;
						return {
							...prev,
							files: prev.files.map((f) =>
								f.id === fileId ? { ...f, changes: result.changes || [] } : f,
							),
						};
					});
					loadedFilesRef.current.add(fileId);
					setLoadedFiles(new Set(loadedFilesRef.current));
				}
			} catch (err) {
				console.error(`Failed to load file content for ${fileId}:`, err);
			} finally {
				loadingFilesRef.current.delete(fileId);
				setLoadingFiles(new Set(loadingFilesRef.current));
			}
		},
		[diffData, workspaceId, worktreeId],
	);

	const handleRefresh = useCallback(() => {
		loadFileList(true);
	}, [loadFileList]);

	useEffect(() => {
		if (enabled) {
			loadFileList(false);
		} else {
			setDiffData(null);
			setError(null);
			setLoading(false);
			setRefreshing(false);
			setLoadedFiles(new Set());
			setLoadingFiles(new Set());
			loadedFilesRef.current = new Set();
			loadingFilesRef.current = new Set();
		}
	}, [enabled, loadFileList]);

	return {
		diffData,
		loading,
		refreshing,
		error,
		refresh: handleRefresh,
		loadFileContent,
		loadedFiles,
		loadingFiles,
	};
}
