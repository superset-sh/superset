import {
	createContext,
	type ReactNode,
	type RefObject,
	useCallback,
	useContext,
	useRef,
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
}

const ScrollContext = createContext<ScrollContextValue | null>(null);

export function ScrollProvider({ children }: { children: ReactNode }) {
	const fileRefs = useRef<Map<string, HTMLDivElement>>(new Map());
	const containerRef = useRef<HTMLDivElement>(null);

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
			const element = fileRefs.current.get(key);
			const container = containerRef.current;

			if (element && container) {
				const scrollTop = element.offsetTop - container.offsetTop - 16;

				container.scrollTo({
					top: scrollTop,
					behavior: "smooth",
				});
			}
		},
		[],
	);

	return (
		<ScrollContext.Provider
			value={{ registerFileRef, scrollToFile, containerRef }}
		>
			{children}
		</ScrollContext.Provider>
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
