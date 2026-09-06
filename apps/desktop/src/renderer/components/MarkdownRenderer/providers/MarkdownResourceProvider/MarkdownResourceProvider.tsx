import { createContext, type ReactNode, useContext, useMemo } from "react";

export interface MarkdownResources {
	/** Directory of the markdown file; relative image sources resolve against it. */
	documentDirectory: string;
	/** Workspace root; a leading-slash source resolves against it, the way GitHub renders a README. */
	rootPath?: string;
	/** Read a file on the workspace's filesystem — local disk or a cloud sandbox. */
	readFile: (absolutePath: string) => Promise<Uint8Array>;
}

const MarkdownResourceContext = createContext<MarkdownResources | null>(null);

/**
 * Marks the markdown below as a file on disk, so images that point at other
 * files — `./shot.png`, `../assets/logo.svg`, `/docs/img.png` — resolve and
 * load. Without it (GitHub bodies, notices) those sources stay blocked:
 * there is nothing to resolve them against.
 */
export function MarkdownResourceProvider({
	documentDirectory,
	rootPath,
	readFile,
	children,
}: MarkdownResources & { children: ReactNode }) {
	const value = useMemo(
		() => ({ documentDirectory, rootPath, readFile }),
		[documentDirectory, rootPath, readFile],
	);
	return (
		<MarkdownResourceContext.Provider value={value}>
			{children}
		</MarkdownResourceContext.Provider>
	);
}

export function useMarkdownResources(): MarkdownResources | null {
	return useContext(MarkdownResourceContext);
}
