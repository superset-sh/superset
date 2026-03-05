import { relative } from "pathe";
import { useEffect, useMemo } from "react";
import { electronTrpc } from "renderer/lib/electron-trpc";
import type { ChangeCategory } from "shared/changes-types";
import { isImageFile } from "shared/file-types";

interface UseFileContentParams {
	worktreePath: string;
	/** Absolute file path (or remote URL) */
	filePath: string;
	viewMode: "raw" | "diff" | "rendered";
	diffCategory?: ChangeCategory;
	commitHash?: string;
	oldPath?: string;
	isDirty: boolean;
	originalContentRef: React.MutableRefObject<string>;
	originalDiffContentRef: React.MutableRefObject<string>;
}

/**
 * Derives a worktree-relative path from an absolute path.
 * Returns null if the path is not inside the worktree.
 */
function toRelativePath(
	absolutePath: string,
	worktreePath: string,
): string | null {
	const rel = relative(worktreePath, absolutePath);
	if (rel.startsWith("..") || rel === "") return null;
	return rel;
}

export function useFileContent({
	worktreePath,
	filePath,
	viewMode,
	diffCategory,
	commitHash,
	oldPath,
	isDirty,
	originalContentRef,
	originalDiffContentRef,
}: UseFileContentParams) {
	// For remote URLs (e.g. Vercel Blob), skip all IPC queries
	const isRemote =
		filePath.startsWith("https://") || filePath.startsWith("http://");

	// Derive worktree-relative path for git-aware operations (secureFs)
	const relativePath = useMemo(
		() => (worktreePath ? toRelativePath(filePath, worktreePath) : null),
		[filePath, worktreePath],
	);

	// File is inside the worktree if we can derive a relative path
	const isInsideWorktree = relativePath !== null;

	const { data: branchData } = electronTrpc.changes.getBranches.useQuery(
		{ worktreePath },
		{
			enabled:
				!isRemote &&
				isInsideWorktree &&
				!!worktreePath &&
				diffCategory === "against-base",
		},
	);
	const effectiveBaseBranch =
		branchData?.worktreeBaseBranch ?? branchData?.defaultBranch ?? "main";

	const isImage = isImageFile(filePath);

	// Use filesystem.readFile for files outside the worktree (absolute paths)
	const { data: externalFileData, isLoading: isLoadingExternal } =
		electronTrpc.filesystem.readFile.useQuery(
			{ filePath },
			{
				enabled:
					!isRemote &&
					!isInsideWorktree &&
					viewMode !== "diff" &&
					!isImage &&
					!!filePath,
			},
		);

	// Use changes.readWorkingFile for worktree-relative paths
	const { data: rawFileData, isLoading: isLoadingRaw } =
		electronTrpc.changes.readWorkingFile.useQuery(
			{ worktreePath, filePath: relativePath ?? "" },
			{
				enabled:
					!isRemote &&
					isInsideWorktree &&
					viewMode !== "diff" &&
					!isImage &&
					!!relativePath &&
					!!worktreePath,
			},
		);

	// Merge external and worktree file data into a single result
	const effectiveRawFileData = isInsideWorktree
		? rawFileData
		: externalFileData;
	const effectiveIsLoadingRaw = isInsideWorktree
		? isLoadingRaw
		: isLoadingExternal;

	const { data: imageData, isLoading: isLoadingImage } =
		electronTrpc.changes.readWorkingFileImage.useQuery(
			{ worktreePath, filePath: relativePath ?? "" },
			{
				enabled:
					!isRemote &&
					isInsideWorktree &&
					viewMode === "rendered" &&
					isImage &&
					!!relativePath &&
					!!worktreePath,
			},
		);

	const { data: diffData, isLoading: isLoadingDiff } =
		electronTrpc.changes.getFileContents.useQuery(
			{
				worktreePath,
				filePath: relativePath ?? "",
				oldPath,
				category: diffCategory ?? "unstaged",
				commitHash,
				defaultBranch:
					diffCategory === "against-base" ? effectiveBaseBranch : undefined,
			},
			{
				enabled:
					!isRemote &&
					isInsideWorktree &&
					viewMode === "diff" &&
					!!diffCategory &&
					!!relativePath &&
					!!worktreePath,
			},
		);

	// biome-ignore lint/correctness/useExhaustiveDependencies: Only update baseline when content loads
	useEffect(() => {
		if (effectiveRawFileData?.ok === true && !isDirty) {
			originalContentRef.current = effectiveRawFileData.content;
		}
	}, [effectiveRawFileData]);

	// biome-ignore lint/correctness/useExhaustiveDependencies: Only update baseline when diff loads
	useEffect(() => {
		if (diffData && !isDirty) {
			originalDiffContentRef.current = diffData.modified;
		}
	}, [diffData]);

	// For remote URLs, return the URL directly as imageData (works with <img src=>)
	const remoteImageData = useMemo(
		() =>
			isRemote
				? { ok: true as const, dataUrl: filePath, byteLength: 0 }
				: undefined,
		[isRemote, filePath],
	);

	return {
		rawFileData: effectiveRawFileData,
		isLoadingRaw: effectiveIsLoadingRaw || (isImage && isLoadingImage),
		imageData: isRemote ? remoteImageData : imageData,
		isLoadingImage: isRemote ? false : isLoadingImage,
		diffData,
		isLoadingDiff,
	};
}
