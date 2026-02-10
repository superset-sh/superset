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

interface FocusModeInput {
	sortedAgainstBase: ChangedFile[];
	commits: { hash: string; files: ChangedFile[] }[];
	sortedStaged: ChangedFile[];
	sortedUnstaged: ChangedFile[];
	worktreePath: string;
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
		navigatePrev,
		navigateNext,
		handleToggleFocusMode,
		getFocusedFileActions,
	};
}
