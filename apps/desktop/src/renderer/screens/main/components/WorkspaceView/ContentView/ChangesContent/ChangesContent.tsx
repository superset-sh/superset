import { useState } from "react";
import { trpc } from "renderer/lib/trpc";
import { useChangesStore } from "renderer/stores/changes";
import { DiffToolbar } from "./components/DiffToolbar";
import { DiffViewer } from "./components/DiffViewer";
import { DiscardConfirmDialog } from "./components/DiscardConfirmDialog";
import { EmptyState } from "./components/EmptyState";
import { FileHeader } from "./components/FileHeader";
import { useFileActions } from "./hooks/useFileActions";

export function ChangesContent() {
	const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);

	const { data: activeWorkspace } = trpc.workspaces.getActive.useQuery();
	const worktreePath = activeWorkspace?.worktreePath;

	const { viewMode, setViewMode, baseBranch, getSelectedFile } =
		useChangesStore();

	const selectedFileState = getSelectedFile(worktreePath || "");
	const selectedFile = selectedFileState?.file ?? null;
	const selectedCategory = selectedFileState?.category ?? "against-main";
	const selectedCommitHash = selectedFileState?.commitHash ?? null;

	const { data: branchData } = trpc.changes.getBranches.useQuery(
		{ worktreePath: worktreePath || "" },
		{ enabled: !!worktreePath },
	);

	const effectiveBaseBranch = baseBranch ?? branchData?.defaultBranch ?? "main";

	const {
		data: contents,
		isLoading: isLoadingContents,
		error: contentsError,
	} = trpc.changes.getFileContents.useQuery(
		{
			worktreePath: worktreePath || "",
			filePath: selectedFile?.path || "",
			oldPath: selectedFile?.oldPath,
			category: selectedCategory,
			commitHash: selectedCommitHash || undefined,
			defaultBranch: effectiveBaseBranch,
		},
		{
			enabled: !!worktreePath && !!selectedFile,
		},
	);

	const { stage, unstage, discard, deleteFile, isPending } = useFileActions({
		worktreePath,
		filePath: selectedFile?.path,
	});

	const isUnstaged = selectedCategory === "unstaged";
	const isStaged = selectedCategory === "staged";

	const handleDiscard = () => {
		if (!worktreePath || !selectedFile) return;
		setShowDiscardConfirm(true);
	};

	const confirmDiscard = () => {
		if (!worktreePath || !selectedFile) return;
		if (selectedFile.status === "untracked") {
			deleteFile();
		} else {
			discard();
		}
	};

	if (!worktreePath) {
		return (
			<EmptyState
				title="No workspace selected"
				description="Select a workspace to view its changes"
			/>
		);
	}

	if (!selectedFile) {
		return (
			<EmptyState
				title="No file selected"
				description="Select a file from the sidebar to view its diff"
			/>
		);
	}

	if (isLoadingContents) {
		return (
			<div className="flex-1 flex items-center justify-center text-muted-foreground">
				Loading diff...
			</div>
		);
	}

	if (contentsError || !contents) {
		return (
			<EmptyState
				title="Unable to load diff"
				description={contentsError?.message || "An error occurred"}
			/>
		);
	}

	const isUntracked = selectedFile.status === "untracked";

	return (
		<>
			<div className="flex-1 h-full flex flex-col bg-tertiary rounded-lg">
				<div className="flex flex-col h-full bg-background m-2 rounded-lg overflow-hidden">
					<FileHeader file={selectedFile} worktreePath={worktreePath} />
					<DiffToolbar
						viewMode={viewMode}
						onViewModeChange={setViewMode}
						category={selectedCategory}
						onStage={isUnstaged ? stage : undefined}
						onUnstage={isStaged ? unstage : undefined}
						onDiscard={isUnstaged ? handleDiscard : undefined}
						isActioning={isPending}
					/>
					<div className="flex-1">
						<DiffViewer contents={contents} viewMode={viewMode} />
					</div>
				</div>
			</div>

			<DiscardConfirmDialog
				open={showDiscardConfirm}
				onOpenChange={setShowDiscardConfirm}
				filePath={selectedFile.path}
				isUntracked={isUntracked}
				onConfirm={confirmDiscard}
			/>
		</>
	);
}
