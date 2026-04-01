import {
	createContext,
	type ReactNode,
	type RefObject,
	useCallback,
	useContext,
	useMemo,
	useRef,
	useState,
} from "react";
import { toAbsoluteWorkspacePath } from "shared/absolute-paths";
import type { ChangeCategory, ChangedFile } from "shared/changes-types";

function createFileKey(
	file: ChangedFile,
	category: ChangeCategory,
	commitHash?: string,
	worktreePath?: string,
): string {
	const canonicalPath = worktreePath
		? toAbsoluteWorkspacePath(worktreePath, file.path)
		: file.path;
	return `${category}:${commitHash ?? ""}:${canonicalPath}`;
}

export interface ActiveFileInfo {
	file: ChangedFile;
	category: ChangeCategory;
	commitHash?: string;
	worktreePath: string;
}

export interface FileEntry {
	ref: HTMLDivElement;
	info: ActiveFileInfo;
}

interface ScrollContextValue {
	registerFileRef: (
		file: ChangedFile,
		category: ChangeCategory,
		commitHash: string | undefined,
		worktreePath: string,
		ref: HTMLDivElement | null,
	) => void;
	scrollToFile: (
		file: ChangedFile,
		category: ChangeCategory,
		commitHash?: string,
		worktreePath?: string,
	) => void;
	fileEntries: RefObject<Map<string, FileEntry>>;
	containerRef: RefObject<HTMLDivElement | null>;
	viewedFiles: Set<string>;
	setFileViewed: (key: string, viewed: boolean) => void;
	viewedCount: number;
	activeFileKey: string | null;
	setActiveFileKey: (key: string | null) => void;
	activeFileInfo: ActiveFileInfo | null;
	setActiveFileInfo: (info: ActiveFileInfo | null) => void;
	focusedFileKey: string | null;
	setFocusedFileKey: (key: string | null) => void;
}

const ScrollContext = createContext<ScrollContextValue | null>(null);

export function ScrollProvider({ children }: { children: ReactNode }) {
	const fileEntries = useRef<Map<string, FileEntry>>(new Map());
	const containerRef = useRef<HTMLDivElement>(null);
	const [viewedFiles, setViewedFiles] = useState<Set<string>>(new Set());
	const [activeFileKey, setActiveFileKey] = useState<string | null>(null);
	const [activeFileInfo, setActiveFileInfo] = useState<ActiveFileInfo | null>(
		null,
	);
	const [focusedFileKey, setFocusedFileKey] = useState<string | null>(null);

	const registerFileRef = useCallback(
		(
			file: ChangedFile,
			category: ChangeCategory,
			commitHash: string | undefined,
			worktreePath: string,
			ref: HTMLDivElement | null,
		) => {
			const key = createFileKey(file, category, commitHash, worktreePath);
			if (ref) {
				fileEntries.current.set(key, {
					ref,
					info: { file, category, commitHash, worktreePath },
				});
			} else {
				fileEntries.current.delete(key);
			}
		},
		[],
	);

	const scrollToFile = useCallback(
		(
			file: ChangedFile,
			category: ChangeCategory,
			commitHash?: string,
			worktreePath?: string,
		) => {
			const key = createFileKey(file, category, commitHash, worktreePath);
			setFocusedFileKey(key);
			setActiveFileKey(key);
			const entry = fileEntries.current.get(key);
			if (entry) {
				entry.ref.scrollIntoView({ behavior: "instant", block: "start" });
			}
		},
		[],
	);

	const setFileViewed = useCallback((key: string, viewed: boolean) => {
		setViewedFiles((prev) => {
			const next = new Set(prev);
			if (viewed) {
				next.add(key);
			} else {
				next.delete(key);
			}
			return next;
		});
	}, []);

	const viewedCount = viewedFiles.size;

	const value = useMemo(
		() => ({
			registerFileRef,
			scrollToFile,
			fileEntries,
			containerRef,
			viewedFiles,
			setFileViewed,
			viewedCount,
			activeFileKey,
			setActiveFileKey,
			activeFileInfo,
			setActiveFileInfo,
			focusedFileKey,
			setFocusedFileKey,
		}),
		[
			registerFileRef,
			scrollToFile,
			viewedFiles,
			setFileViewed,
			viewedCount,
			activeFileKey,
			activeFileInfo,
			focusedFileKey,
		],
	);

	return (
		<ScrollContext.Provider value={value}>{children}</ScrollContext.Provider>
	);
}

export function useScrollContext() {
	const context = useContext(ScrollContext);
	if (!context) {
		throw new Error("useScrollContext must be used within a ScrollProvider");
	}
	return context;
}

export { createFileKey };
