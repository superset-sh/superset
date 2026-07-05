export interface FileMentionResult {
	id: string;
	name: string;
	relativePath: string;
	isDirectory: boolean;
}

export type FileMentionSearchFn = (
	query: string,
) => Promise<FileMentionResult[]>;
