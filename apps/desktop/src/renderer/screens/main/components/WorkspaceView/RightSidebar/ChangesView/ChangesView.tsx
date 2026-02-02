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
import { useChangesStore } from "renderer/stores/changes";
import type { ChangeCategory, ChangedFile } from "shared/changes-types";
import { CategorySection } from "./components/CategorySection";
import { ChangesHeader } from "./components/ChangesHeader";
import { CommitInput } from "./components/CommitInput";
import { CommitItem } from "./components/CommitItem";
import { FileList } from "./components/FileList";
import { RepoSection } from "./components/RepoSection";

interface ChangesViewProps {
	onFileOpen?: (
		file: ChangedFile,
		category: ChangeCategory,
		commitHash?: string,
		repoPath?: string,
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

	const { baseBranch } = useChangesStore();
	const { data: branchData } = electronTrpc.changes.getBranches.useQuery(
		{ worktreePath: worktreePath || "" },
		{ enabled: !!worktreePath },
	);

	const effectiveBaseBranch = baseBranch ?? branchData?.defaultBranch ?? "main";

	// Use multi-repo status query
	const {
		data: multiRepoStatus,
		isLoading,
		refetch,
	} = electronTrpc.changes.getMultiRepoStatus.useQuery(
		{ worktreePath: worktreePath || "", defaultBranch: effectiveBaseBranch },
		{
			enabled: !!worktreePath,
			refetchInterval: 2500,
			refetchOnWindowFocus: true,
		},
	);

	const { data: githubStatus, refetch: refetchGithubStatus } =
		electronTrpc.workspaces.getGitHubStatus.useQuery(
			{ workspaceId: workspaceId ?? "" },
			{
				enabled: !!workspaceId,
				refetchInterval: 10000,
			},
		);

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
	const [discardDialogRepoPath, setDiscardDialogRepoPath] = useState<
		string | undefined
	>(undefined);

	const handleDiscard = (file: ChangedFile, repoPath?: string) => {
		if (!worktreePath) return;
		if (file.status === "untracked" || file.status === "added") {
			deleteUntrackedMutation.mutate({
				worktreePath,
				filePath: file.path,
				repoPath,
			});
		} else {
			discardChangesMutation.mutate({
				worktreePath,
				filePath: file.path,
				repoPath,
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
		toggleRepoExpanded,
		isRepoExpanded,
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

	// Check if we have multiple repos
	const repos = multiRepoStatus?.repos ?? [];
	const isMultiRepo = repos.length > 1;

	// For single repo mode, get the root repo status
	const rootRepo = repos.find((r) => r.isRoot) ?? repos[0];

	const combinedUnstaged = useMemo(
		() =>
			rootRepo?.unstaged && rootRepo?.untracked
				? [...rootRepo.unstaged, ...rootRepo.untracked]
				: [],
		[rootRepo?.unstaged, rootRepo?.untracked],
	);

	/**
	 * Handles file selection from staged/unstaged lists.
	 * Passes repoPath so the diff viewer queries the correct nested repo.
	 */
	const handleFileSelect = (
		file: ChangedFile,
		category: ChangeCategory,
		repoPath?: string,
	) => {
		if (!worktreePath) return;
		selectFile(worktreePath, file, category, null, repoPath);
		onFileOpen?.(file, category, undefined, repoPath);
	};

	/**
	 * Handles file selection from the commits list.
	 * Passes repoPath to support viewing committed files in nested repos.
	 */
	const handleCommitFileSelect = (
		file: ChangedFile,
		commitHash: string,
		repoPath?: string,
	) => {
		if (!worktreePath) return;
		selectFile(worktreePath, file, "committed", commitHash, repoPath);
		onFileOpen?.(file, "committed", commitHash, repoPath);
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

	if (!multiRepoStatus || repos.length === 0) {
		return (
			<div className="flex-1 flex items-center justify-center text-muted-foreground text-sm p-4">
				Unable to load changes
			</div>
		);
	}

	const hasChanges =
		multiRepoStatus.totalStaged > 0 ||
		multiRepoStatus.totalUnstaged > 0 ||
		multiRepoStatus.totalUntracked > 0 ||
		(rootRepo?.againstBase?.length ?? 0) > 0 ||
		(rootRepo?.commits?.length ?? 0) > 0;

	const commitsWithFiles = (rootRepo?.commits ?? []).map((commit) => ({
		...commit,
		files: commitFilesMap.get(commit.hash) || [],
	}));

	const hasStagedChanges = rootRepo ? rootRepo.staged.length > 0 : false;
	const hasExistingPR = !!githubStatus?.pr;
	const prUrl = githubStatus?.pr?.url;

	// Multi-repo view
	if (isMultiRepo) {
		return (
			<div className="flex flex-col h-full">
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

				{!hasChanges ? (
					<div className="flex-1 flex items-center justify-center text-muted-foreground text-sm px-4 text-center">
						No changes detected
					</div>
				) : (
					<div className="flex-1 overflow-y-auto">
						{repos.map((repo) => (
							<RepoSection
								key={repo.repoPath}
								repo={repo}
								worktreePath={worktreePath}
								isExpanded={isRepoExpanded(repo.repoPath)}
								onToggle={() => toggleRepoExpanded(repo.repoPath)}
								selectedFile={selectedFile}
								selectedCommitHash={selectedCommitHash}
								fileListViewMode={fileListViewMode}
								expandedSections={expandedSections}
								onToggleSection={toggleSection}
								onFileSelect={handleFileSelect}
								onStageFile={(file, repoPath) =>
									stageFileMutation.mutate({
										worktreePath,
										filePath: file.path,
										repoPath,
									})
								}
								onUnstageFile={(file, repoPath) =>
									unstageFileMutation.mutate({
										worktreePath,
										filePath: file.path,
										repoPath,
									})
								}
								onDiscard={handleDiscard}
								onStageAll={(repoPath) =>
									stageAllMutation.mutate({ worktreePath, repoPath })
								}
								onUnstageAll={(repoPath) =>
									unstageAllMutation.mutate({ worktreePath, repoPath })
								}
								onDiscardAllUnstaged={(repoPath) => {
									setDiscardDialogRepoPath(repoPath);
									setShowDiscardUnstagedDialog(true);
								}}
								onDiscardAllStaged={(repoPath) => {
									setDiscardDialogRepoPath(repoPath);
									setShowDiscardStagedDialog(true);
								}}
								isStaging={
									stageFileMutation.isPending || stageAllMutation.isPending
								}
								isUnstaging={
									unstageFileMutation.isPending || unstageAllMutation.isPending
								}
								isDiscarding={
									discardChangesMutation.isPending ||
									deleteUntrackedMutation.isPending ||
									discardAllUnstagedMutation.isPending ||
									discardAllStagedMutation.isPending
								}
								isExpandedView={isExpandedView}
								commitInput={
									<CommitInput
										worktreePath={worktreePath}
										hasStagedChanges={repo.staged.length > 0}
										pushCount={repo.pushCount}
										pullCount={repo.pullCount}
										hasUpstream={repo.hasUpstream}
										hasExistingPR={repo.isRoot && hasExistingPR}
										prUrl={repo.isRoot ? prUrl : undefined}
										onRefresh={handleRefresh}
										repoPath={repo.repoPath}
									/>
								}
							/>
						))}
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
								This will revert all unstaged modifications. Untracked files
								will not be affected. This action cannot be undone.
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
										worktreePath,
										repoPath: discardDialogRepoPath,
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
								This will unstage and revert all staged changes. Untracked files
								will not be affected. This action cannot be undone.
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
										worktreePath,
										repoPath: discardDialogRepoPath,
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

	// Single repo view (backward compatible)
	return (
		<div className="flex flex-col h-full">
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
				pushCount={rootRepo?.pushCount ?? 0}
				pullCount={rootRepo?.pullCount ?? 0}
				hasUpstream={rootRepo?.hasUpstream ?? false}
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
						count={rootRepo?.againstBase?.length ?? 0}
						isExpanded={expandedSections["against-base"]}
						onToggle={() => toggleSection("against-base")}
					>
						<FileList
							files={rootRepo?.againstBase ?? []}
							viewMode={fileListViewMode}
							selectedFile={selectedFile}
							selectedCommitHash={selectedCommitHash}
							onFileSelect={(file) => handleFileSelect(file, "against-base")}
							worktreePath={worktreePath}
							category="against-base"
							isExpandedView={isExpandedView}
						/>
					</CategorySection>

					<CategorySection
						title="Commits"
						count={rootRepo?.commits?.length ?? 0}
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
								isExpandedView={isExpandedView}
							/>
						))}
					</CategorySection>

					<CategorySection
						title="Staged"
						count={rootRepo?.staged?.length ?? 0}
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
							files={rootRepo?.staged ?? []}
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
							onDiscard={(file) => handleDiscard(file)}
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
							This will revert all unstaged modifications. Untracked files will
							not be affected. This action cannot be undone.
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
							This will unstage and revert all staged changes. Untracked files
							will not be affected. This action cannot be undone.
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
