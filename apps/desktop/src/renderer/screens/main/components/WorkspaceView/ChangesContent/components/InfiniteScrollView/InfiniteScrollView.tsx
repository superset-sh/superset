import { useCallback, useMemo, useState } from "react";
import { useChangesStore } from "renderer/stores/changes";
import type { GitChangesStatus } from "shared/changes-types";
import { useScrollContext } from "../../context";
import { sortFiles } from "../../utils";
import { FileDiffSection } from "../FileDiffSection";
import { CategoryHeader } from "./components/CategoryHeader";
import { DiffToolbar } from "./components/DiffToolbar";
import { useFileMutations } from "./hooks/useFileMutations";
import { useFocusMode } from "./hooks/useFocusMode";
import { useOrderedSections } from "./hooks/useOrderedSections";

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
		sectionOrder,
		expandedSections: expandedCategories,
		moveSection,
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
		sectionOrder,
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
	const orderedSections = useOrderedSections({
		sectionOrder,
		baseBranch,
		worktreePath,
		scrollElementRef: containerRef,
		collapsedFiles,
		onToggleFile: toggleFile,
		expandedSections: expandedCategories,
		toggleSection: toggleCategory,
		againstBaseFiles: sortedAgainstBase,
		commits: status.commits,
		stagedFiles: sortedStaged,
		unstagedFiles: sortedUnstaged,
		onUnstageFile: (file) =>
			unstageFileMutation.mutate({
				worktreePath,
				filePath: file.path,
			}),
		onStageFile: (file) =>
			stageFileMutation.mutate({
				worktreePath,
				filePath: file.path,
			}),
		onDiscardFile: handleDiscard,
		isActioning,
	});

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

			{focusMode
				? focusedEntry && (
						<FileDiffSection
							key={focusedEntry.key}
							file={focusedEntry.file}
							category={focusedEntry.category}
							commitHash={focusedEntry.commitHash}
							worktreePath={worktreePath}
							baseBranch={
								focusedEntry.category === "against-base"
									? baseBranch
									: undefined
							}
							isExpanded={!collapsedFiles.has(focusedEntry.key)}
							onToggleExpanded={() => toggleFile(focusedEntry.key)}
							{...getFocusedFileActions(focusedEntry)}
							isActioning={isActioning}
						/>
					)
				: orderedSections
						.filter((section) => section.count > 0)
						.map((section) => (
							<div key={section.id}>
								<CategoryHeader
									id={section.id}
									title={section.title}
									count={section.count}
									isExpanded={section.isExpanded}
									onToggle={section.onToggle}
									onMove={moveSection}
								/>
								{section.content}
							</div>
						))}
		</div>
	);
}
