import { useEffect } from "react";
import { electronTrpc } from "renderer/lib/electron-trpc";
import type { ChangeCategory } from "shared/changes-types";

interface UseFileContentParams {
	worktreePath: string;
	filePath: string;
	viewMode: "raw" | "diff" | "rendered";
	diffCategory?: ChangeCategory;
	commitHash?: string;
	oldPath?: string;
	isDirty: boolean;
	originalContentRef: React.MutableRefObject<string>;
	originalDiffContentRef: React.MutableRefObject<string>;
	/** Nested repo path for multi-repo support (if different from worktreePath) */
	repoPath?: string;
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
	repoPath,
}: UseFileContentParams) {
	const { data: branchData } = electronTrpc.changes.getBranches.useQuery(
		{ worktreePath },
		{ enabled: !!worktreePath && diffCategory === "against-base" },
	);
	const effectiveBaseBranch = branchData?.defaultBranch ?? "main";

	// Query working file for raw/rendered modes
	// repoPath tells the backend which nested repo to read from (if any)
	const { data: rawFileData, isLoading: isLoadingRaw } =
		electronTrpc.changes.readWorkingFile.useQuery(
			{ worktreePath, filePath, repoPath },
			{
				enabled: viewMode !== "diff" && !!filePath && !!worktreePath,
			},
		);

	// Query file contents for diff mode (original vs modified)
	// repoPath ensures we query the correct nested repo's git history
	const { data: diffData, isLoading: isLoadingDiff } =
		electronTrpc.changes.getFileContents.useQuery(
			{
				worktreePath,
				filePath,
				oldPath,
				category: diffCategory ?? "unstaged",
				commitHash,
				defaultBranch:
					diffCategory === "against-base" ? effectiveBaseBranch : undefined,
				repoPath,
			},
			{
				enabled:
					viewMode === "diff" && !!diffCategory && !!filePath && !!worktreePath,
			},
		);

	// biome-ignore lint/correctness/useExhaustiveDependencies: Only update baseline when content loads
	useEffect(() => {
		if (rawFileData?.ok === true && !isDirty) {
			originalContentRef.current = rawFileData.content;
		}
	}, [rawFileData]);

	// biome-ignore lint/correctness/useExhaustiveDependencies: Only update baseline when diff loads
	useEffect(() => {
		if (diffData && !isDirty) {
			originalDiffContentRef.current = diffData.modified;
		}
	}, [diffData]);

	return {
		rawFileData,
		isLoadingRaw,
		diffData,
		isLoadingDiff,
	};
}
