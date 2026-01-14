import { Button } from "@superset/ui/button";
import { toast } from "@superset/ui/sonner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { useParams } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { HiMiniMinus, HiMiniPlus } from "react-icons/hi2";
import { trpc } from "renderer/lib/trpc";
import { useChangesStore } from "renderer/stores/changes";
import type { ChangeCategory, ChangedFile } from "shared/changes-types";

import { CategorySection } from "./components/CategorySection";
import { ChangesHeader } from "./components/ChangesHeader";
import { CommitInput } from "./components/CommitInput";
import { CommitItem } from "./components/CommitItem";
import { FileList } from "./components/FileList";

interface ChangesViewProps {
	/** Single click - opens in preview mode */
	onFileOpen?: (
		file: ChangedFile,
		category: ChangeCategory,
		commitHash?: string,
	) => void;
	/** Double click - opens pinned (permanent) */
	onFileOpenPinned?: (
		file: ChangedFile,
		category: ChangeCategory,
		commitHash?: string,
	) => void;
}

export function ChangesView({
	onFileOpen,
	onFileOpenPinned,
}: ChangesViewProps) {
	const { workspaceId } = useParams({ strict: false });
	const { data: workspace } = trpc.workspaces.get.useQuery(
		{ id: workspaceId ?? "" },
		{ enabled: !!workspaceId },
	);
	const worktreePath = workspace?.worktreePath;

	const { baseBranch } = useChangesStore();
	const { data: branchData } = trpc.changes.getBranches.useQuery(
		{ worktreePath: worktreePath || "" },
		{ enabled: !!worktreePath },
	);

	const effectiveBaseBranch = baseBranch ?? branchData?.defaultBranch ?? "main";

	const {
		data: status,
		isLoading,
		refetch,
	} = trpc.changes.getStatus.useQuery(
		{ worktreePath: worktreePath || "", defaultBranch: effectiveBaseBranch },
		{
			enabled: !!worktreePath,
			refetchInterval: 2500,
			refetchOnWindowFocus: true,
		},
	);

	const { data: githubStatus, refetch: refetchGithubStatus } =
		trpc.workspaces.getGitHubStatus.useQuery(
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

	const stageAllMutation = trpc.changes.stageAll.useMutation({
		onSuccess: () => refetch(),
		onError: (error) => {
			console.error("Failed to stage all files:", error);
			toast.error(`Failed to stage all: ${error.message}`);
		},
	});

	const unstageAllMutation = trpc.changes.unstageAll.useMutation({
		onSuccess: () => refetch(),
		onError: (error) => {
			console.error("Failed to unstage all files:", error);
			toast.error(`Failed to unstage all: ${error.message}`);
		},
	});

	const stageFileMutation = trpc.changes.stageFile.useMutation({
		onSuccess: () => refetch(),
		onError: (error, variables) => {
			console.error(`Failed to stage file ${variables.filePath}:`, error);
			toast.error(`Failed to stage ${variables.filePath}: ${error.message}`);
		},
	});

	const unstageFileMutation = trpc.changes.unstageFile.useMutation({
		onSuccess: () => refetch(),
		onError: (error, variables) => {
			console.error(`Failed to unstage file ${variables.filePath}:`, error);
			toast.error(`Failed to unstage ${variables.filePath}: ${error.message}`);
		},
	});

	const discardChangesMutation = trpc.changes.discardChanges.useMutation({
		onSuccess: () => refetch(),
		onError: (error, variables) => {
			console.error(
				`Failed to discard changes for ${variables.filePath}:`,
				error,
			);
			toast.error(`Failed to discard changes: ${error.message}`);
		},
	});

	const deleteUntrackedMutation = trpc.changes.deleteUntracked.useMutation({
		onSuccess: () => refetch(),
		onError: (error, variables) => {
			console.error(`Failed to delete ${variables.filePath}:`, error);
			toast.error(`Failed to delete file: ${error.message}`);
		},
	});

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

	// Reset expanded commits when workspace changes to avoid querying
	// old commit hashes against the new worktree
	// biome-ignore lint/correctness/useExhaustiveDependencies: intentionally resets on worktreePath change
	useEffect(() => {
		setExpandedCommits(new Set());
	}, [worktreePath]);

	const commitFilesQueries = trpc.useQueries((t) =>
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

	// Single click - opens in preview mode
	const handleFileSelect = (file: ChangedFile, category: ChangeCategory) => {
		if (!worktreePath) return;
		selectFile(worktreePath, file, category, null);
		onFileOpen?.(file, category);
	};

	// Double click - opens pinned (permanent)
	const handleFileDoubleClick = (
		file: ChangedFile,
		category: ChangeCategory,
	) => {
		if (!worktreePath) return;
		selectFile(worktreePath, file, category, null);
		onFileOpenPinned?.(file, category);
	};

	const handleCommitFileSelect = (file: ChangedFile, commitHash: string) => {
		if (!worktreePath) return;
		selectFile(worktreePath, file, "committed", commitHash);
		onFileOpen?.(file, "committed", commitHash);
	};

	const handleCommitFileDoubleClick = (
		file: ChangedFile,
		commitHash: string,
	) => {
		if (!worktreePath) return;
		selectFile(worktreePath, file, "committed", commitHash);
		onFileOpenPinned?.(file, "committed", commitHash);
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

	const unstagedFiles = [...status.unstaged, ...status.untracked];

	const hasStagedChanges = status.staged.length > 0;
	const hasExistingPR = !!githubStatus?.pr;
	const prUrl = githubStatus?.pr?.url;

	return (
		<div className="flex flex-col h-full">
			<ChangesHeader
				onRefresh={handleRefresh}
				viewMode={fileListViewMode}
				onViewModeChange={setFileListViewMode}
				worktreePath={worktreePath}
				workspaceId={workspaceId}
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
					{/* Against base branch */}
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
							onFileDoubleClick={(file) =>
								handleFileDoubleClick(file, "against-base")
							}
							worktreePath={worktreePath}
						/>
					</CategorySection>

					{/* Commits */}
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
								onFileDoubleClick={handleCommitFileDoubleClick}
								viewMode={fileListViewMode}
								worktreePath={worktreePath}
							/>
						))}
					</CategorySection>

					{/* Staged */}
					<CategorySection
						title="Staged"
						count={status.staged.length}
						isExpanded={expandedSections.staged}
						onToggle={() => toggleSection("staged")}
						actions={
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
						}
					>
						<FileList
							files={status.staged}
							viewMode={fileListViewMode}
							selectedFile={selectedFile}
							selectedCommitHash={selectedCommitHash}
							onFileSelect={(file) => handleFileSelect(file, "staged")}
							onFileDoubleClick={(file) =>
								handleFileDoubleClick(file, "staged")
							}
							onUnstage={(file) =>
								unstageFileMutation.mutate({
									worktreePath: worktreePath || "",
									filePath: file.path,
								})
							}
							isActioning={unstageFileMutation.isPending}
							worktreePath={worktreePath}
						/>
					</CategorySection>

					{/* Unstaged */}
					<CategorySection
						title="Unstaged"
						count={unstagedFiles.length}
						isExpanded={expandedSections.unstaged}
						onToggle={() => toggleSection("unstaged")}
						actions={
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
						}
					>
						<FileList
							files={unstagedFiles}
							viewMode={fileListViewMode}
							selectedFile={selectedFile}
							selectedCommitHash={selectedCommitHash}
							onFileSelect={(file) => handleFileSelect(file, "unstaged")}
							onFileDoubleClick={(file) =>
								handleFileDoubleClick(file, "unstaged")
							}
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
							onDiscard={handleDiscard}
						/>
					</CategorySection>
				</div>
			)}
		</div>
	);
}
