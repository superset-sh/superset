import type { DiffHunk, DiffLine, FileDiff } from "lib/trpc/routers/diff/types";

export type { DiffHunk, DiffLine, FileDiff };

export interface DiffHeaderProps {
	filePath: string;
	additions: number;
	deletions: number;
	language: string;
}

export interface DiffLineProps {
	line: DiffLine;
	language: string;
	style?: React.CSSProperties;
}

export interface DiffViewerProps {
	diff: FileDiff;
}
