import {
	AlertDialog,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@superset/ui/alert-dialog";
import { Button } from "@superset/ui/button";
import { toast } from "@superset/ui/sonner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { useParams } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { HiMiniMinus, HiMiniPlus } from "react-icons/hi2";
import { LuUndo2 } from "react-icons/lu";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { useBranchSyncInvalidation } from "renderer/screens/main/hooks/useBranchSyncInvalidation";
import { useGitChangesStatus } from "renderer/screens/main/hooks/useGitChangesStatus";
import { useChangesStore } from "renderer/stores/changes";
import type { ChangeCategory, ChangedFile } from "shared/changes-types";
import { CategorySection } from "./components/CategorySection";
import { ChangesHeader } from "./components/ChangesHeader";
import { CommitInput } from "./components/CommitInput";
import { CommitItem } from "./components/CommitItem";
import { FileList } from "./components/FileList";

interface ChangesViewProps {
	onFileOpen?: (
		file: ChangedFile,
		category: ChangeCategory,
		commitHash?: string,
	) => void;
	isExpandedView?: boolean;
}

export function ChangesView({ onFileOpen, isExpandedView }: ChangesViewProps) {
	const { workspaceId } = useParams({ strict: false });
	const { data: workspace } = electronTrpc.workspaces.get.useQuery(
		{ id: workspaceId ?? "" },
		{ enabled: !!workspaceId },
	);
	const worktreePath = workspace?.worktreePath;
	const projectId = workspace?.projectId;

	const { status, isLoading, effectiveBaseBranch, refetch } =
		useGitChangesStatus({
			worktreePath,
			refetchInterval: 2500,
			refetchOnWindowFocus: true,
		});

	const { data: githubStatus, refetch: refetchGithubStatus } =
		electronTrpc.workspaces.getGitHubStatus.useQuery(
			{ workspaceId: workspaceId ?? "" },
			{
				enabled: !!workspaceId,
				refetchInterval: 10000,
			},
		);

	useBranchSyncInvalidation({
		gitBranch: status?.branch,
		workspaceBranch: workspace?.branch,
		workspaceId: workspaceId ?? "",
	});

	const handleRefresh = () => {
		refetch();
		refetchGithubStatus();
	};

	const stageAllMutation = electronTrpc.changes.stageAll.useMutation({
		onSuccess: () => refetch(),
		onError: (error) => {
			console.error("Failed to stage all files:", error);
			toast.error(`Failed to stage all: ${error.message}`);
		},
	});

	const unstageAllMutation = electronTrpc.changes.unstageAll.useMutation({
		onSuccess: () => refetch(),
		onError: (error) => {
			console.error("Failed to unstage all files:", error);
			toast.error(`Failed to unstage all: ${error.message}`);
		},
	});

	const stageFileMutation = electronTrpc.changes.stageFile.useMutation({
		onSuccess: () => refetch(),
		onError: (error, variables) => {
			console.error(`Failed to stage file ${variables.filePath}:`, error);
			toast.error(`Failed to stage ${variables.filePath}: ${error.message}`);
		},
	});

	const unstageFileMutation = electronTrpc.changes.unstageFile.useMutation({
		onSuccess: () => refetch(),
		onError: (error, variables) => {
			console.error(`Failed to unstage file ${variables.filePath}:`, error);
			toast.error(`Failed to unstage ${variables.filePath}: ${error.message}`);
		},
	});

	const discardChangesMutation =
		electronTrpc.changes.discardChanges.useMutation({
			onSuccess: () => refetch(),
			onError: (error, variables) => {
				console.error(
					`Failed to discard changes for ${variables.filePath}:`,
					error,
				);
				toast.error(`Failed to discard changes: ${error.message}`);
			},
		});

	const deleteUntrackedMutation =
		electronTrpc.changes.deleteUntracked.useMutation({
			onSuccess: () => refetch(),
			onError: (error, variables) => {
				console.error(`Failed to delete ${variables.filePath}:`, error);
				toast.error(`Failed to delete file: ${error.message}`);
			},
		});

	const discardAllUnstagedMutation =
		electronTrpc.changes.discardAllUnstaged.useMutation({
			onSuccess: () => {
				toast.success("Discarded all unstaged changes");
				refetch();
			},
			onError: (error) => {
				console.error("Failed to discard all unstaged:", error);
				toast.error(`Failed to discard: ${error.message}`);
			},
		});

	const discardAllStagedMutation =
		electronTrpc.changes.discardAllStaged.useMutation({
			onSuccess: () => {
				toast.success("Discarded all staged changes");
				refetch();
			},
			onError: (error) => {
				console.error("Failed to discard all staged:", error);
				toast.error(`Failed to discard: ${error.message}`);
			},
		});

	const stashMutation = electronTrpc.changes.stash.useMutation({
		onSuccess: () => {
			toast.success("Changes stashed");
			refetch();
		},
		onError: (error) => {
			console.error("Failed to stash:", error);
			toast.error(`Failed to stash: ${error.message}`);
		},
	});

	const stashIncludeUntrackedMutation =
		electronTrpc.changes.stashIncludeUntracked.useMutation({
			onSuccess: () => {
				toast.success("All changes stashed (including untracked)");
				refetch();
			},
			onError: (error) => {
				console.error("Failed to stash:", error);
				toast.error(`Failed to stash: ${error.message}`);
			},
		});

	const stashPopMutation = electronTrpc.changes.stashPop.useMutation({
		onSuccess: () => {
			toast.success("Stash applied and removed");
			refetch();
		},
		onError: (error) => {
			console.error("Failed to pop stash:", error);
			toast.error(`Failed to pop stash: ${error.message}`);
		},
	});

	const [showDiscardUnstagedDialog, setShowDiscardUnstagedDialog] =
		useState(false);
	const [showDiscardStagedDialog, setShowDiscardStagedDialog] = useState(false);

	const handleDiscard = (file: ChangedFile) => {
		if (!worktreePath) return;
		if (file.status === "untracked" || file.status === "added") {
			deleteUntrackedMutation.mutate({
				worktreePath,
				filePath: file.path,
			});
		} else {
			discardChangesMutation.mutate({
				worktreePath,
				filePath: file.path,
			});
		}
	};

	const {
		expandedSections,
		fileListViewMode,
		selectFile,
		getSelectedFile,
		toggleSection,
		setFileListViewMode,
	} = useChangesStore();

	const selectedFileState = getSelectedFile(worktreePath || "");
	const selectedFile = selectedFileState?.file ?? null;
	const selectedCommitHash = selectedFileState?.commitHash ?? null;

	const [expandedCommits, setExpandedCommits] = useState<Set<string>>(
		new Set(),
	);

	// biome-ignore lint/correctness/useExhaustiveDependencies: reset on workspace change
	useEffect(() => {
		setExpandedCommits(new Set());
	}, [worktreePath]);

	const commitFilesQueries = electronTrpc.useQueries((t) =>
		Array.from(expandedCommits).map((hash) =>
			t.changes.getCommitFiles({
				worktreePath: worktreePath || "",
				commitHash: hash,
			}),
		),
	);

	const commitFilesMap = new Map<string, ChangedFile[]>();
	Array.from(expandedCommits).forEach((hash, index) => {
		const query = commitFilesQueries[index];
		if (query?.data) {
			commitFilesMap.set(hash, query.data);
		}
	});

	const combinedUnstaged = useMemo(
		() =>
			status?.unstaged && status?.untracked
				? [...status.unstaged, ...status.untracked]
				: [],
		[status?.unstaged, status?.untracked],
	);

	const handleFileSelect = (file: ChangedFile, category: ChangeCategory) => {
		if (!worktreePath) return;
		selectFile(worktreePath, file, category, null);
		onFileOpen?.(file, category);
	};

	const handleCommitFileSelect = (file: ChangedFile, commitHash: string) => {
		if (!worktreePath) return;
		selectFile(worktreePath, file, "committed", commitHash);
		onFileOpen?.(file, "committed", commitHash);
	};

	const handleCommitToggle = (hash: string) => {
		setExpandedCommits((prev) => {
			const next = new Set(prev);
			if (next.has(hash)) {
				next.delete(hash);
			} else {
				next.add(hash);
			}
			return next;
		});
	};

	if (!worktreePath) {
		return (
			<div className="flex-1 flex items-center justify-center text-muted-foreground text-sm p-4">
				No workspace selected
			</div>
		);
	}

	if (isLoading) {
		return (
			<div className="flex-1 flex items-center justify-center text-muted-foreground text-sm p-4">
				Loading changes...
			</div>
		);
	}

	if (
		!status ||
		!status.againstBase ||
		!status.commits ||
		!status.staged ||
		!status.unstaged ||
		!status.untracked
	) {
		return (
			<div className="flex-1 flex items-center justify-center text-muted-foreground text-sm p-4">
				Unable to load changes
			</div>
		);
	}

	const hasChanges =
		status.againstBase.length > 0 ||
		status.commits.length > 0 ||
		status.staged.length > 0 ||
		status.unstaged.length > 0 ||
		status.untracked.length > 0;

	const commitsWithFiles = status.commits.map((commit) => ({
		...commit,
		files: commitFilesMap.get(commit.hash) || [],
	}));

	const hasStagedChanges = status.staged.length > 0;
	const hasExistingPR = !!githubStatus?.pr;
	const prUrl = githubStatus?.pr?.url;

	return (
		<div className="flex flex-col flex-1 min-h-0">
			<ChangesHeader
				onRefresh={handleRefresh}
				viewMode={fileListViewMode}
				onViewModeChange={setFileListViewMode}
				worktreePath={worktreePath}
				workspaceId={workspaceId}
				onStash={() => stashMutation.mutate({ worktreePath })}
				onStashIncludeUntracked={() =>
					stashIncludeUntrackedMutation.mutate({ worktreePath })
				}
				onStashPop={() => stashPopMutation.mutate({ worktreePath })}
				isStashPending={
					stashMutation.isPending ||
					stashIncludeUntrackedMutation.isPending ||
					stashPopMutation.isPending
				}
			/>

			<CommitInput
				worktreePath={worktreePath}
				hasStagedChanges={hasStagedChanges}
				pushCount={status.pushCount}
				pullCount={status.pullCount}
				hasUpstream={status.hasUpstream}
				hasExistingPR={hasExistingPR}
				prUrl={prUrl}
				onRefresh={handleRefresh}
			/>

			{!hasChanges ? (
				<div className="flex-1 flex items-center justify-center text-muted-foreground text-sm px-4 text-center">
					No changes detected
				</div>
			) : (
				<div className="flex-1 overflow-y-auto">
					<CategorySection
						title={`Against ${effectiveBaseBranch}`}
						count={status.againstBase.length}
						isExpanded={expandedSections["against-base"]}
						onToggle={() => toggleSection("against-base")}
					>
						<FileList
							files={status.againstBase}
							viewMode={fileListViewMode}
							selectedFile={selectedFile}
							selectedCommitHash={selectedCommitHash}
							onFileSelect={(file) => handleFileSelect(file, "against-base")}
							worktreePath={worktreePath}
							projectId={projectId}
							category="against-base"
							isExpandedView={isExpandedView}
						/>
					</CategorySection>

					<CategorySection
						title="Commits"
						count={status.commits.length}
						isExpanded={expandedSections.committed}
						onToggle={() => toggleSection("committed")}
					>
						{commitsWithFiles.map((commit) => (
							<CommitItem
								key={commit.hash}
								commit={commit}
								isExpanded={expandedCommits.has(commit.hash)}
								onToggle={() => handleCommitToggle(commit.hash)}
								selectedFile={selectedFile}
								selectedCommitHash={selectedCommitHash}
								onFileSelect={handleCommitFileSelect}
								viewMode={fileListViewMode}
								worktreePath={worktreePath}
								projectId={projectId}
								isExpandedView={isExpandedView}
							/>
						))}
					</CategorySection>

					<CategorySection
						title="Staged"
						count={status.staged.length}
						isExpanded={expandedSections.staged}
						onToggle={() => toggleSection("staged")}
						actions={
							<div className="flex items-center gap-0.5">
								<Tooltip>
									<TooltipTrigger asChild>
										<Button
											variant="ghost"
											size="icon"
											className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
											onClick={() => setShowDiscardStagedDialog(true)}
											disabled={discardAllStagedMutation.isPending}
										>
											<LuUndo2 className="w-3.5 h-3.5" />
										</Button>
									</TooltipTrigger>
									<TooltipContent side="bottom">
										Discard all staged
									</TooltipContent>
								</Tooltip>
								<Tooltip>
									<TooltipTrigger asChild>
										<Button
											variant="ghost"
											size="icon"
											className="h-6 w-6"
											onClick={() =>
												unstageAllMutation.mutate({
													worktreePath: worktreePath || "",
												})
											}
											disabled={unstageAllMutation.isPending}
										>
											<HiMiniMinus className="w-4 h-4" />
										</Button>
									</TooltipTrigger>
									<TooltipContent side="bottom">Unstage all</TooltipContent>
								</Tooltip>
							</div>
						}
					>
						<FileList
							files={status.staged}
							viewMode={fileListViewMode}
							selectedFile={selectedFile}
							selectedCommitHash={selectedCommitHash}
							onFileSelect={(file) => handleFileSelect(file, "staged")}
							onUnstage={(file) =>
								unstageFileMutation.mutate({
									worktreePath: worktreePath || "",
									filePath: file.path,
								})
							}
							isActioning={unstageFileMutation.isPending}
							worktreePath={worktreePath}
							projectId={projectId}
							category="staged"
							isExpandedView={isExpandedView}
						/>
					</CategorySection>

					<CategorySection
						title="Unstaged"
						count={combinedUnstaged.length}
						isExpanded={expandedSections.unstaged}
						onToggle={() => toggleSection("unstaged")}
						actions={
							<div className="flex items-center gap-0.5">
								<Tooltip>
									<TooltipTrigger asChild>
										<Button
											variant="ghost"
											size="icon"
											className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
											onClick={() => setShowDiscardUnstagedDialog(true)}
											disabled={discardAllUnstagedMutation.isPending}
										>
											<LuUndo2 className="w-3.5 h-3.5" />
										</Button>
									</TooltipTrigger>
									<TooltipContent side="bottom">
										Discard all unstaged
									</TooltipContent>
								</Tooltip>
								<Tooltip>
									<TooltipTrigger asChild>
										<Button
											variant="ghost"
											size="icon"
											className="h-6 w-6"
											onClick={() =>
												stageAllMutation.mutate({
													worktreePath: worktreePath || "",
												})
											}
											disabled={stageAllMutation.isPending}
										>
											<HiMiniPlus className="w-4 h-4" />
										</Button>
									</TooltipTrigger>
									<TooltipContent side="bottom">Stage all</TooltipContent>
								</Tooltip>
							</div>
						}
					>
						<FileList
							files={combinedUnstaged}
							viewMode={fileListViewMode}
							selectedFile={selectedFile}
							selectedCommitHash={selectedCommitHash}
							onFileSelect={(file) => handleFileSelect(file, "unstaged")}
							onStage={(file) =>
								stageFileMutation.mutate({
									worktreePath: worktreePath || "",
									filePath: file.path,
								})
							}
							isActioning={
								stageFileMutation.isPending ||
								discardChangesMutation.isPending ||
								deleteUntrackedMutation.isPending
							}
							worktreePath={worktreePath}
							projectId={projectId}
							onDiscard={handleDiscard}
							category="unstaged"
							isExpandedView={isExpandedView}
						/>
					</CategorySection>
				</div>
			)}

			<AlertDialog
				open={showDiscardUnstagedDialog}
				onOpenChange={setShowDiscardUnstagedDialog}
			>
				<AlertDialogContent className="max-w-[340px] gap-0 p-0">
					<AlertDialogHeader className="px-4 pt-4 pb-2">
						<AlertDialogTitle className="font-medium">
							Discard all unstaged changes?
						</AlertDialogTitle>
						<AlertDialogDescription>
							This will revert all unstaged modifications and delete untracked
							files. This action cannot be undone.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter className="px-4 pb-4 pt-2 flex-row justify-end gap-2">
						<Button
							variant="ghost"
							size="sm"
							className="h-7 px-3 text-xs"
							onClick={() => setShowDiscardUnstagedDialog(false)}
						>
							Cancel
						</Button>
						<Button
							variant="destructive"
							size="sm"
							className="h-7 px-3 text-xs"
							onClick={() => {
								setShowDiscardUnstagedDialog(false);
								discardAllUnstagedMutation.mutate({
									worktreePath: worktreePath || "",
								});
							}}
						>
							Discard All
						</Button>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>

			<AlertDialog
				open={showDiscardStagedDialog}
				onOpenChange={setShowDiscardStagedDialog}
			>
				<AlertDialogContent className="max-w-[340px] gap-0 p-0">
					<AlertDialogHeader className="px-4 pt-4 pb-2">
						<AlertDialogTitle className="font-medium">
							Discard all staged changes?
						</AlertDialogTitle>
						<AlertDialogDescription>
							This will unstage and revert all staged changes. Staged new files
							will be deleted. This action cannot be undone.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter className="px-4 pb-4 pt-2 flex-row justify-end gap-2">
						<Button
							variant="ghost"
							size="sm"
							className="h-7 px-3 text-xs"
							onClick={() => setShowDiscardStagedDialog(false)}
						>
							Cancel
						</Button>
						<Button
							variant="destructive"
							size="sm"
							className="h-7 px-3 text-xs"
							onClick={() => {
								setShowDiscardStagedDialog(false);
								discardAllStagedMutation.mutate({
									worktreePath: worktreePath || "",
								});
							}}
						>
							Discard All
						</Button>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</div>
	);
}
