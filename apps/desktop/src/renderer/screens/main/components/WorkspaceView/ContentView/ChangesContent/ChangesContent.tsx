import { useCallback, useState } from "react";
import { MarkdownRenderer } from "renderer/components/MarkdownRenderer";
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
	const utils = trpc.useUtils();

	const {
		viewMode,
		setViewMode,
		baseBranch,
		getSelectedFile,
		selectFile,
		getShowRenderedMarkdown,
		toggleRenderedMarkdown,
	} = useChangesStore();

	const selectedFileState = getSelectedFile(worktreePath || "");
	const selectedFile = selectedFileState?.file ?? null;
	const selectedCategory = selectedFileState?.category ?? "against-base";
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

	const saveFileMutation = trpc.changes.saveFile.useMutation({
		onSuccess: () => {
			// Switch to unstaged view if saving from staged (edits become unstaged changes)
			if (selectedCategory === "staged" && worktreePath && selectedFile) {
				selectFile(worktreePath, selectedFile, "unstaged", null);
			}
			utils.changes.getFileContents.invalidate();
			utils.changes.getStatus.invalidate();
		},
	});

	const handleSave = useCallback(
		(content: string) => {
			if (!worktreePath || !selectedFile) return;
			saveFileMutation.mutate({
				worktreePath,
				filePath: selectedFile.path,
				content,
			});
		},
		[worktreePath, selectedFile, saveFileMutation],
	);

	const isUnstaged = selectedCategory === "unstaged";
	const isStaged = selectedCategory === "staged";
	const isEditable = isUnstaged || isStaged;

	const isMarkdownFile = /\.(md|mdx)$/i.test(selectedFile?.path ?? "");
	const showRendered = worktreePath
		? getShowRenderedMarkdown(worktreePath)
		: false;

	const handleToggleRendered = () => {
		if (worktreePath) {
			toggleRenderedMarkdown(worktreePath);
		}
	};

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
			<div className="flex flex-col h-full overflow-hidden">
				<FileHeader file={selectedFile} worktreePath={worktreePath} />
				<DiffToolbar
					viewMode={viewMode}
					onViewModeChange={setViewMode}
					category={selectedCategory}
					onStage={isUnstaged ? stage : undefined}
					onUnstage={isStaged ? unstage : undefined}
					onDiscard={isUnstaged ? handleDiscard : undefined}
					isActioning={isPending}
					isEditable={isEditable}
					isSaving={saveFileMutation.isPending}
					isMarkdownFile={isMarkdownFile}
					showRendered={showRendered}
					onToggleRendered={handleToggleRendered}
				/>
				<div className="flex-1 overflow-hidden">
					{isMarkdownFile && showRendered ? (
						<MarkdownRenderer content={contents.modified} />
					) : (
						<DiffViewer
							contents={contents}
							viewMode={viewMode}
							filePath={selectedFile.path}
							editable={isEditable}
							onSave={handleSave}
						/>
					)}
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
