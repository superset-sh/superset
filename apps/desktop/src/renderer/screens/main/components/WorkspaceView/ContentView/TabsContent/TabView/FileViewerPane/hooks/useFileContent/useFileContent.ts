import { useEffect } from "react";
import { trpc } from "renderer/lib/trpc";
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
	const { data: branchData } = trpc.changes.getBranches.useQuery(
		{ worktreePath },
		{ enabled: !!worktreePath && diffCategory === "against-base" },
	);
	const effectiveBaseBranch = branchData?.defaultBranch ?? "main";

	const { data: rawFileData, isLoading: isLoadingRaw } =
		trpc.changes.readWorkingFile.useQuery(
			{ worktreePath, filePath },
			{
				enabled: viewMode !== "diff" && !!filePath && !!worktreePath,
			},
		);

	const { data: diffData, isLoading: isLoadingDiff } =
		trpc.changes.getFileContents.useQuery(
			{
				worktreePath,
				filePath,
				oldPath,
				category: diffCategory ?? "unstaged",
				commitHash,
				defaultBranch:
					diffCategory === "against-base" ? effectiveBaseBranch : undefined,
			},
			{
				enabled:
					viewMode === "diff" && !!diffCategory && !!filePath && !!worktreePath,
			},
		);

	useEffect(() => {
		if (rawFileData?.ok === true && !isDirty) {
			originalContentRef.current = rawFileData.content;
		}
	}, [rawFileData]);

	useEffect(() => {
		if (diffData?.modified && !isDirty) {
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
