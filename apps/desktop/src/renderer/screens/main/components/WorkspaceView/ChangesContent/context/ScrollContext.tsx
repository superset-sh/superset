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
import type { ChangeCategory, ChangedFile } from "shared/changes-types";

function createFileKey(
	file: ChangedFile,
	category: ChangeCategory,
	commitHash?: string,
): string {
	return `${category}:${commitHash ?? ""}:${file.path}`;
}

interface ScrollContextValue {
	registerFileRef: (
		file: ChangedFile,
		category: ChangeCategory,
		commitHash: string | undefined,
		ref: HTMLDivElement | null,
	) => void;
	scrollToFile: (
		file: ChangedFile,
		category: ChangeCategory,
		commitHash?: string,
	) => void;
	containerRef: RefObject<HTMLDivElement | null>;
	viewedFiles: Set<string>;
	setFileViewed: (key: string, viewed: boolean) => void;
	viewedCount: number;
	activeFileKey: string | null;
	setActiveFileKey: (key: string | null) => void;
	focusedFileKey: string | null;
	setFocusedFileKey: (key: string | null) => void;
}

const ScrollContext = createContext<ScrollContextValue | null>(null);

export function ScrollProvider({ children }: { children: ReactNode }) {
	const fileRefs = useRef<Map<string, HTMLDivElement>>(new Map());
	const containerRef = useRef<HTMLDivElement>(null);
	const [viewedFiles, setViewedFiles] = useState<Set<string>>(new Set());
	const [activeFileKey, setActiveFileKey] = useState<string | null>(null);
	const [focusedFileKey, setFocusedFileKey] = useState<string | null>(null);

	const registerFileRef = useCallback(
		(
			file: ChangedFile,
			category: ChangeCategory,
			commitHash: string | undefined,
			ref: HTMLDivElement | null,
		) => {
			const key = createFileKey(file, category, commitHash);
			if (ref) {
				fileRefs.current.set(key, ref);
			} else {
				fileRefs.current.delete(key);
			}
		},
		[],
	);

	const scrollToFile = useCallback(
		(file: ChangedFile, category: ChangeCategory, commitHash?: string) => {
			const key = createFileKey(file, category, commitHash);
			setFocusedFileKey(key);
			setActiveFileKey(key);
			const element = fileRefs.current.get(key);
			if (element) {
				element.scrollIntoView({ behavior: "instant", block: "start" });
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
			containerRef,
			viewedFiles,
			setFileViewed,
			viewedCount,
			activeFileKey,
			setActiveFileKey,
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
