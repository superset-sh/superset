import { useCallback, useMemo } from "react";
import { useChangesStore } from "renderer/stores/changes";
import type { ChangeCategory, ChangedFile } from "shared/changes-types";
import { createFileKey, useScrollContext } from "../../../../context";

export interface FlatFileEntry {
	file: ChangedFile;
	category: ChangeCategory;
	commitHash?: string;
	key: string;
}

export interface SectionInfo {
	category: ChangeCategory;
	label: string;
	startIndex: number;
	count: number;
}

interface FocusModeInput {
	sortedAgainstBase: ChangedFile[];
	commits: { hash: string; files: ChangedFile[] }[];
	sortedStaged: ChangedFile[];
	sortedUnstaged: ChangedFile[];
	worktreePath: string;
	baseBranch: string;
	stageFile: (params: { worktreePath: string; filePath: string }) => void;
	unstageFile: (params: { worktreePath: string; filePath: string }) => void;
	handleDiscard: (file: ChangedFile) => void;
}

export function useFocusMode({
	sortedAgainstBase,
	commits,
	sortedStaged,
	sortedUnstaged,
	worktreePath,
	baseBranch,
	stageFile,
	unstageFile,
	handleDiscard,
}: FocusModeInput) {
	const { focusedFileKey, setFocusedFileKey, setActiveFileKey, activeFileKey } =
		useScrollContext();
	const { focusMode, toggleFocusMode } = useChangesStore();

	const flatFileList = useMemo<FlatFileEntry[]>(() => {
		const entries: FlatFileEntry[] = [];
		for (const file of sortedAgainstBase) {
			entries.push({
				file,
				category: "against-base",
				key: createFileKey(file, "against-base"),
			});
		}
		for (const commit of commits) {
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
	}, [sortedAgainstBase, commits, sortedStaged, sortedUnstaged]);

	const sections = useMemo<SectionInfo[]>(() => {
		const result: SectionInfo[] = [];
		let offset = 0;

		if (sortedAgainstBase.length > 0) {
			result.push({
				category: "against-base",
				label: `Against ${baseBranch}`,
				startIndex: offset,
				count: sortedAgainstBase.length,
			});
			offset += sortedAgainstBase.length;
		}

		const commitFileCount = commits.reduce((acc, c) => acc + c.files.length, 0);
		if (commitFileCount > 0) {
			result.push({
				category: "committed",
				label: "Commits",
				startIndex: offset,
				count: commitFileCount,
			});
			offset += commitFileCount;
		}

		if (sortedStaged.length > 0) {
			result.push({
				category: "staged",
				label: "Staged",
				startIndex: offset,
				count: sortedStaged.length,
			});
			offset += sortedStaged.length;
		}

		if (sortedUnstaged.length > 0) {
			result.push({
				category: "unstaged",
				label: "Unstaged",
				startIndex: offset,
				count: sortedUnstaged.length,
			});
		}

		return result;
	}, [sortedAgainstBase, commits, sortedStaged, sortedUnstaged, baseBranch]);

	const focusedEntry = focusMode
		? (flatFileList.find((e) => e.key === focusedFileKey) ??
			flatFileList[0] ??
			null)
		: null;

	const focusedIndex = focusedEntry
		? flatFileList.findIndex((e) => e.key === focusedEntry.key)
		: 0;

	const currentSection = useMemo(() => {
		for (let i = sections.length - 1; i >= 0; i--) {
			if (focusedIndex >= sections[i].startIndex) {
				return sections[i];
			}
		}
		return sections[0] ?? null;
	}, [focusedIndex, sections]);

	const indexWithinSection = currentSection
		? focusedIndex - currentSection.startIndex
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

	const navigateToSection = useCallback(
		(category: ChangeCategory) => {
			const section = sections.find((s) => s.category === category);
			if (section) {
				navigateToIndex(section.startIndex);
			}
		},
		[sections, navigateToIndex],
	);

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
							unstageFile({ worktreePath, filePath: entry.file.path }),
						onDiscard: () => handleDiscard(entry.file),
					};
				case "unstaged":
					return {
						onStage: () =>
							stageFile({ worktreePath, filePath: entry.file.path }),
						onDiscard: () => handleDiscard(entry.file),
					};
				default:
					return {};
			}
		},
		[worktreePath, stageFile, unstageFile, handleDiscard],
	);

	return {
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
	};
}
