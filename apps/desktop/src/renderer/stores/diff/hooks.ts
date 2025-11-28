import { useDiffStore } from "./store";

// State selectors
export const useDiffMode = () => useDiffStore((state) => state.mode);
export const useCommitRange = () => useDiffStore((state) => state.commitRange);
export const useScrollToFilePath = () =>
	useDiffStore((state) => state.scrollToFilePath);
export const useExpandedFolders = () =>
	useDiffStore((state) => state.expandedFolders);

// Action selectors
export const useSetDiffMode = () => useDiffStore((state) => state.setMode);
export const useSetCommitRange = () =>
	useDiffStore((state) => state.setCommitRange);
export const useScrollToFile = () =>
	useDiffStore((state) => state.scrollToFile);
export const useClearScrollTarget = () =>
	useDiffStore((state) => state.clearScrollTarget);
export const useToggleFolder = () =>
	useDiffStore((state) => state.toggleFolder);
export const useExpandAllFolders = () =>
	useDiffStore((state) => state.expandAllFolders);
export const useCollapseAllFolders = () =>
	useDiffStore((state) => state.collapseAllFolders);
export const useResetDiff = () => useDiffStore((state) => state.reset);
