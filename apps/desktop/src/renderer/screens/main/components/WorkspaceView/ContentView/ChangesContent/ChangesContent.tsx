import { trpc } from "renderer/lib/trpc";
import { useChangesStore } from "renderer/stores/changes";
import { DiffToolbar } from "./components/DiffToolbar";
import { DiffViewer } from "./components/DiffViewer";
import { EmptyState } from "./components/EmptyState";
import { FileHeader } from "./components/FileHeader";

export function ChangesContent() {
	const { data: activeWorkspace } = trpc.workspaces.getActive.useQuery();
	const worktreePath = activeWorkspace?.worktreePath;

	// Store state
	const {
		selectedFile,
		selectedCategory,
		selectedCommitHash,
		viewMode,
		setViewMode,
		baseBranch,
	} = useChangesStore();

	// Get branches to determine effective base branch
	const { data: branchData } = trpc.changes.getBranches.useQuery(
		{ worktreePath: worktreePath || "" },
		{ enabled: !!worktreePath },
	);

	// Use stored baseBranch or fall back to auto-detected default
	const effectiveBaseBranch = baseBranch ?? branchData?.defaultBranch ?? "main";

	// Fetch file contents for diff viewer
	const {
		data: contents,
		isLoading: isLoadingContents,
		error: contentsError,
	} = trpc.changes.getFileContents.useQuery(
		{
			worktreePath: worktreePath || "",
			filePath: selectedFile?.path || "",
			category: selectedCategory,
			commitHash: selectedCommitHash || undefined,
			defaultBranch: effectiveBaseBranch,
		},
		{
			enabled: !!worktreePath && !!selectedFile,
		},
	);

	// Mutations
	const utils = trpc.useUtils();
	const stageFile = trpc.changes.stageFile.useMutation({
		onSuccess: () => utils.changes.getStatus.invalidate(),
	});
	const unstageFile = trpc.changes.unstageFile.useMutation({
		onSuccess: () => utils.changes.getStatus.invalidate(),
	});
	const discardChanges = trpc.changes.discardChanges.useMutation({
		onSuccess: () => {
			utils.changes.getStatus.invalidate();
			utils.changes.getFileContents.invalidate();
		},
	});
	const deleteUntracked = trpc.changes.deleteUntracked.useMutation({
		onSuccess: () => {
			utils.changes.getStatus.invalidate();
			utils.changes.getFileContents.invalidate();
		},
	});

	const isActioning =
		stageFile.isPending ||
		unstageFile.isPending ||
		discardChanges.isPending ||
		deleteUntracked.isPending;

	const handleStage = () => {
		if (!worktreePath || !selectedFile) return;
		stageFile.mutate({ worktreePath, filePath: selectedFile.path });
	};

	const handleUnstage = () => {
		if (!worktreePath || !selectedFile) return;
		unstageFile.mutate({ worktreePath, filePath: selectedFile.path });
	};

	const handleDiscard = () => {
		if (!worktreePath || !selectedFile) return;
		// TODO: Add confirmation dialog
		if (selectedFile.status === "untracked") {
			deleteUntracked.mutate({ worktreePath, filePath: selectedFile.path });
		} else {
			discardChanges.mutate({ worktreePath, filePath: selectedFile.path });
		}
	};

	// No workspace selected
	if (!worktreePath) {
		return (
			<EmptyState
				title="No workspace selected"
				description="Select a workspace to view its changes"
			/>
		);
	}

	// No file selected
	if (!selectedFile) {
		return (
			<EmptyState
				title="No file selected"
				description="Select a file from the sidebar to view its diff"
			/>
		);
	}

	// Loading state
	if (isLoadingContents) {
		return (
			<div className="flex-1 flex items-center justify-center text-muted-foreground">
				Loading diff...
			</div>
		);
	}

	// Error state
	if (contentsError || !contents) {
		return (
			<EmptyState
				title="Unable to load diff"
				description={contentsError?.message || "An error occurred"}
			/>
		);
	}

	return (
		<div className="flex-1 h-full flex flex-col overflow-hidden bg-background">
			<FileHeader file={selectedFile} />
			<DiffToolbar
				viewMode={viewMode}
				onViewModeChange={setViewMode}
				category={selectedCategory}
				onStage={selectedCategory === "unstaged" ? handleStage : undefined}
				onUnstage={selectedCategory === "staged" ? handleUnstage : undefined}
				onDiscard={selectedCategory === "unstaged" ? handleDiscard : undefined}
				isActioning={isActioning}
			/>
			<div className="flex-1 overflow-hidden">
				<DiffViewer contents={contents} viewMode={viewMode} />
			</div>
		</div>
	);
}
