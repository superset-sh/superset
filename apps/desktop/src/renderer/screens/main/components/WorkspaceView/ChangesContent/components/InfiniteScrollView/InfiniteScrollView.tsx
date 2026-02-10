import { toast } from "@superset/ui/sonner";
import { useCallback, useMemo, useState } from "react";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { useChangesStore } from "renderer/stores/changes";
import type {
	ChangeCategory,
	ChangedFile,
	GitChangesStatus,
} from "shared/changes-types";
import { createFileKey, useScrollContext } from "../../context";
import { sortFiles } from "../../utils";
import { FileDiffSection } from "../FileDiffSection";
import { VirtualizedFileList } from "../VirtualizedFileList";
import { CategoryHeader } from "./components/CategoryHeader";
import { CommitSection } from "./components/CommitSection";
import { DiffToolbar } from "./components/DiffToolbar";

interface InfiniteScrollViewProps {
	status: GitChangesStatus;
	worktreePath: string;
	baseBranch: string;
}

interface FlatFileEntry {
	file: ChangedFile;
	category: ChangeCategory;
	commitHash?: string;
	key: string;
}

export function InfiniteScrollView({
	status,
	worktreePath,
	baseBranch,
}: InfiniteScrollViewProps) {
	const {
		containerRef,
		viewedCount,
		focusedFileKey,
		setFocusedFileKey,
		setActiveFileKey,
		activeFileKey,
	} = useScrollContext();
	const {
		viewMode: diffViewMode,
		setViewMode: setDiffViewMode,
		hideUnchangedRegions,
		toggleHideUnchangedRegions,
		fileListViewMode,
		expandedSections: expandedCategories,
		toggleSection: toggleCategory,
		focusMode,
		toggleFocusMode,
	} = useChangesStore();
	const [collapsedFiles, setCollapsedFiles] = useState<Set<string>>(new Set());

	const totals = useMemo(() => {
		const allFiles = [
			...status.againstBase,
			...status.staged,
			...status.unstaged,
			...status.untracked,
		];
		const commitFileCount = status.commits.reduce(
			(acc, commit) => acc + commit.files.length,
			0,
		);

		let totalAdditions = 0;
		let totalDeletions = 0;

		for (const file of allFiles) {
			totalAdditions += file.additions;
			totalDeletions += file.deletions;
		}
		for (const commit of status.commits) {
			for (const file of commit.files) {
				totalAdditions += file.additions;
				totalDeletions += file.deletions;
			}
		}

		return {
			fileCount: allFiles.length + commitFileCount,
			additions: totalAdditions,
			deletions: totalDeletions,
		};
	}, [status]);

	const toggleFile = useCallback((key: string) => {
		setCollapsedFiles((prev) => {
			const next = new Set(prev);
			if (next.has(key)) {
				next.delete(key);
			} else {
				next.add(key);
			}
			return next;
		});
	}, []);

	const trpcUtils = electronTrpc.useUtils();
	const refetch = useCallback(() => {
		trpcUtils.changes.getStatus.invalidate({
			worktreePath,
			defaultBranch: baseBranch,
		});
	}, [trpcUtils, worktreePath, baseBranch]);

	const stageFileMutation = electronTrpc.changes.stageFile.useMutation({
		onSuccess: () => refetch(),
		onError: (error, variables) => {
			console.error(
				`[InfiniteScrollView] Failed to stage file ${variables.filePath}:`,
				error,
			);
			toast.error(`Failed to stage ${variables.filePath}: ${error.message}`);
		},
	});

	const unstageFileMutation = electronTrpc.changes.unstageFile.useMutation({
		onSuccess: () => refetch(),
		onError: (error, variables) => {
			console.error(
				`[InfiniteScrollView] Failed to unstage file ${variables.filePath}:`,
				error,
			);
			toast.error(`Failed to unstage ${variables.filePath}: ${error.message}`);
		},
	});

	const discardChangesMutation =
		electronTrpc.changes.discardChanges.useMutation({
			onSuccess: () => refetch(),
			onError: (error, variables) => {
				console.error(
					`[InfiniteScrollView] Failed to discard changes for ${variables.filePath}:`,
					error,
				);
				toast.error(`Failed to discard changes: ${error.message}`);
			},
		});

	const deleteUntrackedMutation =
		electronTrpc.changes.deleteUntracked.useMutation({
			onSuccess: () => refetch(),
			onError: (error, variables) => {
				console.error(
					`[InfiniteScrollView] Failed to delete ${variables.filePath}:`,
					error,
				);
				toast.error(`Failed to delete file: ${error.message}`);
			},
		});

	const handleDiscard = useCallback(
		(file: ChangedFile) => {
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
		},
		[worktreePath, deleteUntrackedMutation, discardChangesMutation],
	);

	const sortedAgainstBase = useMemo(
		() => sortFiles(status.againstBase, fileListViewMode),
		[status.againstBase, fileListViewMode],
	);
	const sortedStaged = useMemo(
		() => sortFiles(status.staged, fileListViewMode),
		[status.staged, fileListViewMode],
	);
	const sortedUnstaged = useMemo(
		() =>
			sortFiles([...status.unstaged, ...status.untracked], fileListViewMode),
		[status.unstaged, status.untracked, fileListViewMode],
	);

	// Flat file list for focus mode navigation
	const flatFileList = useMemo<FlatFileEntry[]>(() => {
		const entries: FlatFileEntry[] = [];
		for (const file of sortedAgainstBase) {
			entries.push({
				file,
				category: "against-base",
				key: createFileKey(file, "against-base"),
			});
		}
		for (const commit of status.commits) {
			for (const file of commit.files) {
				entries.push({
					file,
					category: "committed",
					commitHash: commit.hash,
					key: createFileKey(file, "committed", commit.hash),
				});
			}
		}
		for (const file of sortedStaged) {
			entries.push({
				file,
				category: "staged",
				key: createFileKey(file, "staged"),
			});
		}
		for (const file of sortedUnstaged) {
			entries.push({
				file,
				category: "unstaged",
				key: createFileKey(file, "unstaged"),
			});
		}
		return entries;
	}, [sortedAgainstBase, status.commits, sortedStaged, sortedUnstaged]);

	const focusedEntry = focusMode
		? (flatFileList.find((e) => e.key === focusedFileKey) ??
			flatFileList[0] ??
			null)
		: null;

	const focusedIndex = focusedEntry
		? flatFileList.findIndex((e) => e.key === focusedEntry.key)
		: 0;

	const navigateToIndex = useCallback(
		(index: number) => {
			const entry = flatFileList[index];
			if (entry) {
				setFocusedFileKey(entry.key);
				setActiveFileKey(entry.key);
			}
		},
		[flatFileList, setFocusedFileKey, setActiveFileKey],
	);

	const navigatePrev = useCallback(() => {
		if (focusedIndex > 0) {
			navigateToIndex(focusedIndex - 1);
		}
	}, [focusedIndex, navigateToIndex]);

	const navigateNext = useCallback(() => {
		if (focusedIndex < flatFileList.length - 1) {
			navigateToIndex(focusedIndex + 1);
		}
	}, [focusedIndex, flatFileList.length, navigateToIndex]);

	const handleToggleFocusMode = useCallback(() => {
		if (!focusMode && flatFileList.length > 0) {
			const targetKey = activeFileKey ?? flatFileList[0].key;
			setFocusedFileKey(targetKey);
			setActiveFileKey(targetKey);
		}
		toggleFocusMode();
	}, [
		focusMode,
		toggleFocusMode,
		flatFileList,
		activeFileKey,
		setFocusedFileKey,
		setActiveFileKey,
	]);

	const getFocusedFileActions = useCallback(
		(entry: FlatFileEntry) => {
			switch (entry.category) {
				case "staged":
					return {
						onUnstage: () =>
							unstageFileMutation.mutate({
								worktreePath,
								filePath: entry.file.path,
							}),
						onDiscard: () => handleDiscard(entry.file),
					};
				case "unstaged":
					return {
						onStage: () =>
							stageFileMutation.mutate({
								worktreePath,
								filePath: entry.file.path,
							}),
						onDiscard: () => handleDiscard(entry.file),
					};
				default:
					return {};
			}
		},
		[worktreePath, stageFileMutation, unstageFileMutation, handleDiscard],
	);

	const hasChanges =
		sortedAgainstBase.length > 0 ||
		status.commits.length > 0 ||
		sortedStaged.length > 0 ||
		sortedUnstaged.length > 0;

	if (!hasChanges) {
		return (
			<div className="flex items-center justify-center h-full text-muted-foreground">
				No changes detected
			</div>
		);
	}

	const isActioning =
		stageFileMutation.isPending ||
		unstageFileMutation.isPending ||
		discardChangesMutation.isPending ||
		deleteUntrackedMutation.isPending;

	return (
		<div ref={containerRef} className="h-full overflow-y-auto">
			<DiffToolbar
				viewedCount={viewedCount}
				totalFiles={totals.fileCount}
				totalAdditions={totals.additions}
				totalDeletions={totals.deletions}
				pushCount={status.pushCount}
				pullCount={status.pullCount}
				hasUpstream={status.hasUpstream}
				diffViewMode={diffViewMode}
				onDiffViewModeChange={setDiffViewMode}
				hideUnchangedRegions={hideUnchangedRegions}
				onToggleHideUnchangedRegions={toggleHideUnchangedRegions}
				focusMode={focusMode}
				onToggleFocusMode={handleToggleFocusMode}
				currentFileIndex={focusedIndex}
				totalFocusFiles={flatFileList.length}
				onNavigatePrev={navigatePrev}
				onNavigateNext={navigateNext}
			/>

			{focusMode ? (
				focusedEntry && (
					<FileDiffSection
						key={focusedEntry.key}
						file={focusedEntry.file}
						category={focusedEntry.category}
						commitHash={focusedEntry.commitHash}
						worktreePath={worktreePath}
						baseBranch={
							focusedEntry.category === "against-base" ? baseBranch : undefined
						}
						isExpanded={!collapsedFiles.has(focusedEntry.key)}
						onToggleExpanded={() => toggleFile(focusedEntry.key)}
						{...getFocusedFileActions(focusedEntry)}
						isActioning={isActioning}
					/>
				)
			) : (
				<>
					{sortedAgainstBase.length > 0 && (
						<>
							<CategoryHeader
								title={`Against ${baseBranch}`}
								count={sortedAgainstBase.length}
								isExpanded={expandedCategories["against-base"]}
								onToggle={() => toggleCategory("against-base")}
							/>
							{expandedCategories["against-base"] && (
								<VirtualizedFileList
									files={sortedAgainstBase}
									category="against-base"
									worktreePath={worktreePath}
									baseBranch={baseBranch}
									collapsedFiles={collapsedFiles}
									onToggleFile={toggleFile}
									scrollElementRef={containerRef}
								/>
							)}
						</>
					)}

					{status.commits.length > 0 && (
						<>
							<CategoryHeader
								title="Commits"
								count={status.commits.length}
								isExpanded={expandedCategories.committed}
								onToggle={() => toggleCategory("committed")}
							/>
							{expandedCategories.committed && (
								<div>
									{status.commits.map((commit) => (
										<CommitSection
											key={commit.hash}
											commit={commit}
											worktreePath={worktreePath}
											collapsedFiles={collapsedFiles}
											onToggleFile={toggleFile}
											scrollElementRef={containerRef}
										/>
									))}
								</div>
							)}
						</>
					)}

					{sortedStaged.length > 0 && (
						<>
							<CategoryHeader
								title="Staged"
								count={sortedStaged.length}
								isExpanded={expandedCategories.staged}
								onToggle={() => toggleCategory("staged")}
							/>
							{expandedCategories.staged && (
								<VirtualizedFileList
									files={sortedStaged}
									category="staged"
									worktreePath={worktreePath}
									collapsedFiles={collapsedFiles}
									onToggleFile={toggleFile}
									scrollElementRef={containerRef}
									onUnstage={(file) =>
										unstageFileMutation.mutate({
											worktreePath,
											filePath: file.path,
										})
									}
									onDiscard={handleDiscard}
									isActioning={isActioning}
								/>
							)}
						</>
					)}

					{sortedUnstaged.length > 0 && (
						<>
							<CategoryHeader
								title="Unstaged"
								count={sortedUnstaged.length}
								isExpanded={expandedCategories.unstaged}
								onToggle={() => toggleCategory("unstaged")}
							/>
							{expandedCategories.unstaged && (
								<VirtualizedFileList
									files={sortedUnstaged}
									category="unstaged"
									worktreePath={worktreePath}
									collapsedFiles={collapsedFiles}
									onToggleFile={toggleFile}
									scrollElementRef={containerRef}
									onStage={(file) =>
										stageFileMutation.mutate({
											worktreePath,
											filePath: file.path,
										})
									}
									onDiscard={handleDiscard}
									isActioning={isActioning}
								/>
							)}
						</>
					)}
				</>
			)}
		</div>
	);
}
