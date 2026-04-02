import { toast } from "@superset/ui/sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@superset/ui/tabs";
import { cn } from "@superset/ui/utils";
import { useParams } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { electronTrpc } from "renderer/lib/electron-trpc";
import {
	getGitHubPRCommentsQueryPolicy,
	getGitHubStatusQueryPolicy,
} from "renderer/lib/githubQueryPolicy";
import { useWorkspaceFileEvents } from "renderer/screens/main/components/WorkspaceView/hooks/useWorkspaceFileEvents";
import {
	checkSummaryIconConfig,
	countOpenPullRequestComments,
} from "renderer/screens/main/components/WorkspaceView/RightSidebar/ChangesView/components/ReviewPanel/utils";
import { useBranchSyncInvalidation } from "renderer/screens/main/hooks/useBranchSyncInvalidation";
import { useGitChangesStatus } from "renderer/screens/main/hooks/useGitChangesStatus";
import { useChangesStore } from "renderer/stores/changes";
import {
	pathsMatch,
	retargetAbsolutePath,
	toAbsoluteWorkspacePath,
} from "shared/absolute-paths";
import type { ChangeCategory, ChangedFile } from "shared/changes-types";
import type { FileSystemChangeEvent } from "shared/file-tree-types";
import { sidebarHeaderTabTriggerClassName } from "../headerTabStyles";
import { CategorySection } from "./components/CategorySection";
import { ChangesHeader } from "./components/ChangesHeader";
import { CommitInput } from "./components/CommitInput";
import { DiscardConfirmDialog } from "./components/DiscardConfirmDialog";
import { ReviewPanel } from "./components/ReviewPanel";
import { useOrderedSections } from "./hooks";
import { getPRActionState, shouldAutoCreatePRAfterPublish } from "./utils";

interface ChangesViewProps {
	onFileOpen?: (
		file: ChangedFile,
		category: ChangeCategory,
		commitHash?: string,
	) => void;
	isExpandedView?: boolean;
	isActive?: boolean;
}

const INACTIVE_BRANCH_REFETCH_INTERVAL_MS = 10_000;

interface PendingChangesRefresh {
	invalidateBranches: boolean;
	invalidateSelectedFile: boolean;
}

type ChangesSidebarTab = "diffs" | "review";

function eventTargetsSelectedFile(
	event: FileSystemChangeEvent,
	selectedAbsolutePath: string | null,
): boolean {
	if (!selectedAbsolutePath) {
		return false;
	}

	if (event.type === "overflow") {
		return true;
	}

	if (event.type === "rename" && event.absolutePath && event.oldAbsolutePath) {
		return (
			retargetAbsolutePath(
				selectedAbsolutePath,
				event.oldAbsolutePath,
				event.absolutePath,
				Boolean(event.isDirectory),
			) !== null
		);
	}

	return event.absolutePath === selectedAbsolutePath;
}

export function ChangesView({
	onFileOpen,
	isExpandedView,
	isActive = true,
}: ChangesViewProps) {
	const { workspaceId } = useParams({ strict: false });
	const trpcUtils = electronTrpc.useUtils();
	const { data: workspace } = electronTrpc.workspaces.get.useQuery(
		{ id: workspaceId ?? "" },
		{ enabled: !!workspaceId },
	);
	const worktreePath = workspace?.worktreePath;
	const projectId = workspace?.projectId;
	const activeTab = useChangesStore((s) => s.activeTab);
	const isReviewTabActive = isActive && activeTab === "review";
	const githubStatusQueryPolicy = getGitHubStatusQueryPolicy(
		"changes-sidebar",
		{
			hasWorkspaceId: !!workspaceId,
			isActive,
			isReviewTabActive,
		},
	);

	const { status, isLoading, effectiveBaseBranch, branchData, refetch } =
		useGitChangesStatus({
			worktreePath,
			refetchInterval: isActive ? 2500 : undefined,
			refetchOnWindowFocus: isActive,
			branchRefetchInterval: isActive
				? undefined
				: INACTIVE_BRANCH_REFETCH_INTERVAL_MS,
			branchRefetchOnWindowFocus: true,
		});

	const {
		data: githubStatus,
		isLoading: isGitHubStatusLoading,
		refetch: refetchGithubStatus,
	} = electronTrpc.workspaces.getGitHubStatus.useQuery(
		{ workspaceId: workspaceId ?? "" },
		githubStatusQueryPolicy,
	);

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

	const stageFilesMutation = electronTrpc.changes.stageFiles.useMutation({
		onSuccess: () => refetch(),
		onError: (error, variables) => {
			console.error(
				`Failed to stage files ${variables.filePaths.join(", ")}:`,
				error,
			);
			toast.error(`Failed to stage files: ${error.message}`);
		},
	});

	const unstageFilesMutation = electronTrpc.changes.unstageFiles.useMutation({
		onSuccess: () => refetch(),
		onError: (error, variables) => {
			console.error(
				`Failed to unstage files ${variables.filePaths.join(", ")}:`,
				error,
			);
			toast.error(`Failed to unstage files: ${error.message}`);
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
	const activePullRequest = githubStatus?.pr ?? null;
	const githubPRCommentsQueryPolicy = getGitHubPRCommentsQueryPolicy({
		hasWorkspaceId: !!workspaceId,
		hasActivePullRequest: !!activePullRequest,
		isActive,
		isReviewTabActive,
	});
	const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const pendingRefreshRef = useRef<PendingChangesRefresh>({
		invalidateBranches: false,
		invalidateSelectedFile: false,
	});
	const {
		data: githubComments = [],
		isLoading: isGitHubCommentsLoading,
		refetch: refetchGitHubComments,
	} = electronTrpc.workspaces.getGitHubPRComments.useQuery(
		{
			workspaceId: workspaceId ?? "",
			...(activePullRequest
				? {
						prNumber: activePullRequest.number,
						repoUrl: githubStatus?.repoUrl,
						upstreamUrl: githubStatus?.upstreamUrl,
						isFork: githubStatus?.isFork,
					}
				: {}),
		},
		githubPRCommentsQueryPolicy,
	);

	useBranchSyncInvalidation({
		gitBranch: status?.branch ?? branchData?.currentBranch ?? undefined,
		workspaceBranch: workspace?.branch,
		workspaceId: workspaceId ?? "",
	});

	const handleRefresh = () => {
		refetch();
		refetchGithubStatus();
		if (activePullRequest) {
			refetchGitHubComments();
		}
	};

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
		sectionOrder,
		selectFile,
		getSelectedFile,
		setActiveTab,
		toggleSection,
		moveSection,
		setFileListViewMode,
	} = useChangesStore();

	const selectedFileState = getSelectedFile(workspaceId || "");
	const selectedFile = selectedFileState?.file ?? null;
	const selectedCommitHash = selectedFileState?.commitHash ?? null;

	const [expandedCommits, setExpandedCommits] = useState<Set<string>>(
		new Set(),
	);

	// biome-ignore lint/correctness/useExhaustiveDependencies: reset on workspace change
	useEffect(() => {
		setExpandedCommits(new Set());
	}, [worktreePath]);

	useEffect(() => {
		return () => {
			if (refreshTimerRef.current) {
				clearTimeout(refreshTimerRef.current);
				refreshTimerRef.current = null;
			}
		};
	}, []);

	useWorkspaceFileEvents(
		workspaceId ?? "",
		(event) => {
			if (!worktreePath) {
				return;
			}

			const selectedAbsolutePath = selectedFileState?.absolutePath ?? null;
			pendingRefreshRef.current.invalidateBranches ||=
				event.type === "overflow";
			pendingRefreshRef.current.invalidateSelectedFile ||=
				eventTargetsSelectedFile(event, selectedAbsolutePath);

			if (refreshTimerRef.current) {
				clearTimeout(refreshTimerRef.current);
			}

			refreshTimerRef.current = setTimeout(() => {
				refreshTimerRef.current = null;
				const pending = pendingRefreshRef.current;
				pendingRefreshRef.current = {
					invalidateBranches: false,
					invalidateSelectedFile: false,
				};

				const invalidations: Promise<unknown>[] = [
					trpcUtils.changes.getStatus.invalidate({
						worktreePath,
						defaultBranch: effectiveBaseBranch,
					}),
				];

				if (pending.invalidateBranches) {
					invalidations.push(
						trpcUtils.changes.getBranches.invalidate({ worktreePath }),
					);
				}

				if (pending.invalidateSelectedFile && selectedFileState) {
					const oldAbsPath = selectedFileState.file.oldPath
						? toAbsoluteWorkspacePath(
								worktreePath,
								selectedFileState.file.oldPath,
							)
						: undefined;
					invalidations.push(
						trpcUtils.changes.getGitFileContents.invalidate({
							worktreePath,
							absolutePath: selectedFileState.absolutePath,
							oldAbsolutePath: oldAbsPath,
						}),
						trpcUtils.changes.getGitOriginalContent.invalidate({
							worktreePath,
							absolutePath: selectedFileState.absolutePath,
							oldAbsolutePath: oldAbsPath,
						}),
					);
					if (workspaceId) {
						invalidations.push(
							trpcUtils.filesystem.readFile.invalidate({
								workspaceId,
								absolutePath: selectedFileState.absolutePath,
							}),
						);
					}
				}

				Promise.all(invalidations).catch((error) => {
					console.error("[ChangesView] Failed to refresh changes state:", {
						worktreePath,
						error,
					});
				});
			}, 75);
		},
		Boolean(workspaceId && worktreePath),
	);

	const expandedCommitHashes = useMemo(
		() =>
			isActive && expandedSections.committed
				? Array.from(expandedCommits)
				: ([] as string[]),
		[isActive, expandedSections.committed, expandedCommits],
	);

	const commitFilesQueries = electronTrpc.useQueries((t) =>
		expandedCommitHashes.map((hash) =>
			t.changes.getCommitFiles({
				worktreePath: worktreePath || "",
				commitHash: hash,
			}),
		),
	);

	const commitFilesMap = useMemo(() => {
		const map = new Map<string, ChangedFile[]>();
		expandedCommitHashes.forEach((hash, index) => {
			const query = commitFilesQueries[index];
			if (query?.data) {
				map.set(hash, query.data);
			}
		});
		return map;
	}, [expandedCommitHashes, commitFilesQueries]);

	const combinedUnstaged = useMemo(
		() =>
			status?.unstaged && status?.untracked
				? [...status.unstaged, ...status.untracked]
				: [],
		[status?.unstaged, status?.untracked],
	);

	const handleFileSelect = (file: ChangedFile, category: ChangeCategory) => {
		if (!workspaceId || !worktreePath) return;
		selectFile(
			workspaceId,
			toAbsoluteWorkspacePath(worktreePath, file.path),
			file,
			category,
			null,
		);
		onFileOpen?.(file, category);
	};

	const handleCommitFileSelect = (file: ChangedFile, commitHash: string) => {
		if (!workspaceId || !worktreePath) return;
		selectFile(
			workspaceId,
			toAbsoluteWorkspacePath(worktreePath, file.path),
			file,
			"committed",
			commitHash,
		);
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

	const againstBaseFiles = status?.againstBase ?? [];
	const commits = status?.commits ?? [];
	const stagedFiles = status?.staged ?? [];
	const unstagedFiles = status?.unstaged ?? [];
	const untrackedFiles = status?.untracked ?? [];

	const hasChanges =
		againstBaseFiles.length > 0 ||
		commits.length > 0 ||
		stagedFiles.length > 0 ||
		unstagedFiles.length > 0 ||
		untrackedFiles.length > 0;

	const commitsWithFiles = commits.map((commit) => ({
		...commit,
		files: commitFilesMap.get(commit.hash) || commit.files,
	}));

	useEffect(() => {
		if (!workspaceId || !worktreePath || !selectedFileState) {
			return;
		}

		const existsInSelection =
			selectedFileState.category === "against-base"
				? againstBaseFiles.some((file) =>
						pathsMatch(
							toAbsoluteWorkspacePath(worktreePath, file.path),
							selectedFileState.absolutePath,
						),
					)
				: selectedFileState.category === "staged"
					? stagedFiles.some((file) =>
							pathsMatch(
								toAbsoluteWorkspacePath(worktreePath, file.path),
								selectedFileState.absolutePath,
							),
						)
					: selectedFileState.category === "unstaged"
						? combinedUnstaged.some((file) =>
								pathsMatch(
									toAbsoluteWorkspacePath(worktreePath, file.path),
									selectedFileState.absolutePath,
								),
							)
						: selectedFileState.category === "committed";

		if (!existsInSelection) {
			selectFile(workspaceId, null, null);
		}
	}, [
		againstBaseFiles,
		combinedUnstaged,
		selectFile,
		selectedFileState,
		stagedFiles,
		workspaceId,
		worktreePath,
	]);

	const hasStagedChanges = stagedFiles.length > 0;
	const hasExistingPR = !!activePullRequest;
	const hasGitHubRepo = !!githubStatus?.repoUrl;
	const defaultBranch =
		branchData?.defaultBranch ?? status?.defaultBranch ?? "";
	const isDefaultBranch = status?.branch === defaultBranch;
	const prActionState = getPRActionState({
		hasRepo: hasGitHubRepo,
		hasExistingPR,
		hasUpstream: status?.hasUpstream ?? false,
		pushCount: status?.pushCount ?? 0,
		pullCount: status?.pullCount ?? 0,
		isDefaultBranch,
	});
	const shouldAutoCreatePR =
		hasGitHubRepo &&
		shouldAutoCreatePRAfterPublish({
			hasExistingPR,
			isDefaultBranch,
		});
	const orderedSections = useOrderedSections({
		sectionOrder,
		effectiveBaseBranch: effectiveBaseBranch ?? "",
		expandedSections,
		toggleSection,
		fileListViewMode,
		selectedFile,
		selectedCommitHash,
		worktreePath: worktreePath ?? "",
		projectId,
		isExpandedView,
		againstBaseFiles,
		onAgainstBaseFileSelect: (file) => handleFileSelect(file, "against-base"),
		commitsWithFiles,
		expandedCommits,
		onCommitToggle: handleCommitToggle,
		onCommitFileSelect: handleCommitFileSelect,
		stagedFiles,
		onStagedFileSelect: (file) => handleFileSelect(file, "staged"),
		onUnstageFile: (file) =>
			unstageFileMutation.mutate({
				worktreePath: worktreePath || "",
				filePath: file.path,
			}),
		onUnstageFiles: (files) =>
			unstageFilesMutation.mutate({
				worktreePath: worktreePath || "",
				filePaths: files.map((f) => f.path),
			}),
		onShowDiscardStagedDialog: () => setShowDiscardStagedDialog(true),
		onUnstageAll: () =>
			unstageAllMutation.mutate({
				worktreePath: worktreePath || "",
			}),
		isDiscardAllStagedPending: discardAllStagedMutation.isPending,
		isUnstageAllPending: unstageAllMutation.isPending,
		isStagedActioning:
			unstageFileMutation.isPending ||
			unstageFilesMutation.isPending ||
			unstageAllMutation.isPending ||
			discardAllStagedMutation.isPending,
		unstagedFiles: combinedUnstaged,
		onUnstagedFileSelect: (file) => handleFileSelect(file, "unstaged"),
		onStageFile: (file) =>
			stageFileMutation.mutate({
				worktreePath: worktreePath || "",
				filePath: file.path,
			}),
		onStageFiles: (files) =>
			stageFilesMutation.mutate({
				worktreePath: worktreePath || "",
				filePaths: files.map((f) => f.path),
			}),
		onDiscardFile: handleDiscard,
		onShowDiscardUnstagedDialog: () => setShowDiscardUnstagedDialog(true),
		onStageAll: () =>
			stageAllMutation.mutate({
				worktreePath: worktreePath || "",
			}),
		isDiscardAllUnstagedPending: discardAllUnstagedMutation.isPending,
		isStageAllPending: stageAllMutation.isPending,
		isUnstagedActioning:
			stageFileMutation.isPending ||
			stageFilesMutation.isPending ||
			stageAllMutation.isPending ||
			discardChangesMutation.isPending ||
			deleteUntrackedMutation.isPending ||
			discardAllUnstagedMutation.isPending,
	});

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

	const againstMainCount = status.againstBase.length;
	const reviewCommentCount = activePullRequest
		? countOpenPullRequestComments(githubComments)
		: 0;
	const relevantReviewTabChecks =
		activePullRequest?.checks.filter(
			(check) => check.status !== "skipped" && check.status !== "cancelled",
		) ?? [];
	const reviewTabChecksStatus =
		relevantReviewTabChecks.length > 0
			? (activePullRequest?.checksStatus ?? "none")
			: "none";
	const reviewTabChecksStatusConfig =
		checkSummaryIconConfig[reviewTabChecksStatus];
	const ReviewTabChecksIcon = reviewTabChecksStatusConfig.icon;

	return (
		<div className="flex flex-col flex-1 min-h-0">
			<Tabs
				value={activeTab}
				onValueChange={(value) => setActiveTab(value as ChangesSidebarTab)}
				className="flex flex-1 min-h-0 flex-col gap-0"
			>
				<div className="h-8 shrink-0 border-b bg-background">
					<TabsList className="grid h-full w-full grid-cols-2 items-stretch gap-0 rounded-none bg-transparent p-0">
						<TabsTrigger
							value="diffs"
							className={cn(
								sidebarHeaderTabTriggerClassName,
								"min-w-0 w-full justify-center",
							)}
						>
							<span>Diffs</span>
							<span className="text-[11px] text-muted-foreground/60 tabular-nums">
								{againstMainCount}
							</span>
						</TabsTrigger>
						<TabsTrigger
							value="review"
							className={cn(
								sidebarHeaderTabTriggerClassName,
								"min-w-0 w-full justify-center",
							)}
						>
							<span>Review</span>
							<span className="text-[11px] text-muted-foreground/60 tabular-nums">
								{reviewCommentCount}
							</span>
							{activePullRequest ? (
								<ReviewTabChecksIcon
									className={cn(
										"size-3 shrink-0",
										reviewTabChecksStatusConfig.className,
										reviewTabChecksStatus === "pending" && "animate-spin",
									)}
								/>
							) : null}
						</TabsTrigger>
					</TabsList>
				</div>

				<TabsContent
					value="diffs"
					className="mt-0 flex min-h-0 flex-1 flex-col outline-none"
				>
					<div>
						<ChangesHeader
							onRefresh={handleRefresh}
							viewMode={fileListViewMode}
							onViewModeChange={setFileListViewMode}
							showViewModeToggle
							worktreePath={worktreePath}
							pr={githubStatus?.pr ?? null}
							isPRStatusLoading={isGitHubStatusLoading}
							canCreatePR={prActionState.canCreatePR}
							createPRBlockedReason={prActionState.createPRBlockedReason}
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
					</div>
					<div className="border-b border-border">
						<CommitInput
							worktreePath={worktreePath}
							hasStagedChanges={hasStagedChanges}
							pushCount={status.pushCount}
							pullCount={status.pullCount}
							hasUpstream={status.hasUpstream}
							pullRequest={activePullRequest ?? null}
							canCreatePR={prActionState.canCreatePR}
							shouldAutoCreatePRAfterPublish={shouldAutoCreatePR}
							onRefresh={handleRefresh}
						/>
					</div>

					{!hasChanges ? (
						<div className="flex flex-1 items-center justify-center px-4 text-center text-sm text-muted-foreground">
							No changes detected
						</div>
					) : (
						<div
							className="flex-1 overflow-y-auto"
							data-changes-scroll-container
						>
							{orderedSections
								.filter((section) => section.count > 0)
								.map((section) => (
									<CategorySection
										key={section.id}
										id={section.id}
										title={section.title}
										count={section.count}
										isExpanded={section.isExpanded}
										onToggle={section.onToggle}
										actions={section.actions}
										onMove={moveSection}
									>
										{section.content}
									</CategorySection>
								))}
						</div>
					)}
				</TabsContent>

				<TabsContent
					value="review"
					className="mt-0 flex min-h-0 flex-1 flex-col outline-none"
				>
					<ReviewPanel
						pr={isGitHubStatusLoading ? null : activePullRequest}
						comments={githubComments}
						isLoading={isGitHubStatusLoading}
						isCommentsLoading={isGitHubCommentsLoading}
						workspaceId={workspaceId}
						onCommentsChange={refetchGitHubComments}
					/>
				</TabsContent>
			</Tabs>

			<DiscardConfirmDialog
				open={showDiscardUnstagedDialog}
				onOpenChange={setShowDiscardUnstagedDialog}
				title="Discard all unstaged changes?"
				description="This will revert all unstaged modifications and delete untracked files. This action cannot be undone."
				onConfirm={() =>
					discardAllUnstagedMutation.mutate({
						worktreePath: worktreePath || "",
					})
				}
				confirmLabel="Discard All"
			/>

			<DiscardConfirmDialog
				open={showDiscardStagedDialog}
				onOpenChange={setShowDiscardStagedDialog}
				title="Discard all staged changes?"
				description="This will unstage and revert all staged changes. Staged new files will be deleted. This action cannot be undone."
				onConfirm={() =>
					discardAllStagedMutation.mutate({
						worktreePath: worktreePath || "",
					})
				}
				confirmLabel="Discard All"
			/>
		</div>
	);
}
