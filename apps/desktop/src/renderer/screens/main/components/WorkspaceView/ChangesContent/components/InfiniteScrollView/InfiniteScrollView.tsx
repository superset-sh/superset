import { Button } from "@superset/ui/button";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useChangesStore } from "renderer/stores/changes";
import { SidebarMode, useSidebarStore } from "renderer/stores/sidebar-state";
import type { GitChangesStatus } from "shared/changes-types";
import { type ActiveFileInfo, useScrollContext } from "../../context";
import { sortFiles } from "../../utils";
import { FileDiffSection } from "../FileDiffSection";
import { CategoryHeader } from "./components/CategoryHeader";
import { DiffToolbar } from "./components/DiffToolbar";
import { StickyFileHeader } from "./components/StickyFileHeader";
import { useFileMutations } from "./hooks/useFileMutations";
import { useFocusMode } from "./hooks/useFocusMode";
import { useOrderedSections } from "./hooks/useOrderedSections";

/** Offset from container top where we detect the "active" file */
const STICKY_HEADER_OFFSET = 80;

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
	const {
		containerRef,
		viewedCount,
		viewedFiles,
		fileEntries,
		setActiveFileKey,
		setActiveFileInfo,
	} = useScrollContext();
	const [stickyFile, setStickyFile] = useState<ActiveFileInfo | null>(null);
	const activeKeyRef = useRef<string | null>(null);

	// Scroll-based active file detection
	useEffect(() => {
		const container = containerRef.current;
		if (!container) return;

		let rafId: number | null = null;

		const handleScroll = () => {
			if (rafId !== null) return;
			rafId = requestAnimationFrame(() => {
				rafId = null;
				const containerRect = container.getBoundingClientRect();
				const threshold = containerRect.top + STICKY_HEADER_OFFSET;

				let bestKey: string | null = null;
				let bestInfo: ActiveFileInfo | null = null;
				let bestTop = -Infinity;

				for (const [key, entry] of fileEntries.current) {
					const rect = entry.ref.getBoundingClientRect();
					if (rect.top <= threshold && rect.bottom > threshold) {
						if (rect.top > bestTop) {
							bestTop = rect.top;
							bestKey = key;
							bestInfo = entry.info;
						}
					}
				}

				if (bestKey !== activeKeyRef.current) {
					activeKeyRef.current = bestKey;
					setActiveFileKey(bestKey);
					setActiveFileInfo(bestInfo);
					setStickyFile(bestInfo);
				}
			});
		};

		container.addEventListener("scroll", handleScroll, { passive: true });
		handleScroll();

		return () => {
			container.removeEventListener("scroll", handleScroll);
			if (rafId !== null) cancelAnimationFrame(rafId);
		};
	}, [containerRef, fileEntries, setActiveFileKey, setActiveFileInfo]);
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
	const isExpandedView = useSidebarStore(
		(state) => state.currentMode === SidebarMode.Changes,
	);
	const setSidebarMode = useSidebarStore((state) => state.setMode);
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

	const resetFileToggle = useCallback((key: string) => {
		setCollapsedFiles((prev) => {
			if (!prev.has(key)) return prev;
			const next = new Set(prev);
			next.delete(key);
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
		viewedFiles,
		onToggleFile: toggleFile,
		onResetFileToggle: resetFileToggle,
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
			<div className="flex h-full flex-col items-center justify-center gap-3 text-muted-foreground">
				<div>No changes detected</div>
				{isExpandedView ? (
					<Button
						variant="outline"
						size="sm"
						onClick={() => setSidebarMode(SidebarMode.Tabs)}
					>
						Close expanded view
					</Button>
				) : null}
			</div>
		);
	}

	return (
		<div ref={containerRef} className="h-full overflow-y-auto">
			<div className="sticky top-0 z-30">
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
				{stickyFile && !focusMode && (
					<StickyFileHeader
						file={stickyFile.file}
						category={stickyFile.category}
						commitHash={stickyFile.commitHash}
						worktreePath={stickyFile.worktreePath}
					/>
				)}
			</div>

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
							isExpanded={viewedFiles.has(focusedEntry.key) ? collapsedFiles.has(focusedEntry.key) : !collapsedFiles.has(focusedEntry.key)}
							onToggleExpanded={() => toggleFile(focusedEntry.key)}
							onResetFileToggle={() => resetFileToggle(focusedEntry.key)}
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
