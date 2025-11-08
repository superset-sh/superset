export interface DiffLine {
	type: "added" | "removed" | "modified" | "unchanged";
	oldLineNumber: number | null;
	newLineNumber: number | null;
	content: string;
}

export interface FileDiff {
	id: string;
	fileName: string;
	filePath: string;
	status: "added" | "deleted" | "modified" | "renamed" | "unchanged";
	oldPath?: string; // For renamed files
	additions: number;
	deletions: number;
	changes: DiffLine[];
	summary?: string; // AI-generated summary of changes
}

export interface DiffViewData {
	title: string;
	description?: string;
	timestamp: string;
	files: FileDiff[];
}
