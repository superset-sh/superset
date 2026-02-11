import { useCallback, useMemo, useState } from "react";
import { useChangesStore } from "renderer/stores/changes";
import type { GitChangesStatus } from "shared/changes-types";
import { useScrollContext } from "../../context";
import { sortFiles } from "../../utils";
import { FileDiffSection } from "../FileDiffSection";
import { VirtualizedFileList } from "../VirtualizedFileList";
import { CategoryHeader } from "./components/CategoryHeader";
import { CommitSection } from "./components/CommitSection";
import { DiffToolbar } from "./components/DiffToolbar";
import { useFileMutations } from "./hooks/useFileMutations";
import { useFocusMode } from "./hooks/useFocusMode";

interface InfiniteScrollViewProps {
	status: GitChangesStatus;
	worktreePath: string;
	baseBranch: string;
}

export function InfiniteScrollView({
	status,
	worktreePath,
	baseBranch,
}: InfiniteScrollViewProps) {
	const { containerRef, viewedCount } = useScrollContext();
	const {
		viewMode: diffViewMode,
		setViewMode: setDiffViewMode,
		hideUnchangedRegions,
		toggleHideUnchangedRegions,
		fileListViewMode,
		expandedSections: expandedCategories,
		toggleSection: toggleCategory,
	} = useChangesStore();
	const [collapsedFiles, setCollapsedFiles] = useState<Set<string>>(new Set());

	const { stageFileMutation, unstageFileMutation, handleDiscard, isActioning } =
		useFileMutations({ worktreePath, baseBranch });

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

	const {
		focusMode,
		focusedEntry,
		focusedIndex,
		flatFileList,
		sections,
		currentSection,
		indexWithinSection,
		navigatePrev,
		navigateNext,
		navigateToSection,
		handleToggleFocusMode,
		getFocusedFileActions,
	} = useFocusMode({
		sortedAgainstBase,
		commits: status.commits,
		sortedStaged,
		sortedUnstaged,
		worktreePath,
		baseBranch,
		stageFile: (params) => stageFileMutation.mutate(params),
		unstageFile: (params) => unstageFileMutation.mutate(params),
		handleDiscard,
	});

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
				sections={sections}
				currentSection={currentSection}
				indexWithinSection={indexWithinSection}
				onNavigatePrev={navigatePrev}
				onNavigateNext={navigateNext}
				onNavigateToSection={navigateToSection}
				isFirstFile={focusedIndex <= 0}
				isLastFile={focusedIndex >= flatFileList.length - 1}
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
