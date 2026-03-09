import type {
	DeletePathsResult,
	MoveCopyResult,
	WorkspaceFsEntry,
	WorkspaceFsExistsResult,
	WorkspaceFsKeywordMatch,
	WorkspaceFsSearchResult,
	WorkspaceFsStat,
	WorkspaceFsWatchEvent,
} from "../types";

export interface WorkspaceFsLocation {
	workspaceId: string;
	absolutePath: string;
}

export interface WorkspaceFsDirectoryQuery extends WorkspaceFsLocation {}

export interface WorkspaceFsWriteFileInput extends WorkspaceFsLocation {
	content: string;
	expectedContent?: string;
}

export interface WorkspaceFsCreateFileInput extends WorkspaceFsLocation {
	content?: string;
}

export interface WorkspaceFsCreateDirectoryInput extends WorkspaceFsLocation {}

export interface WorkspaceFsRenameInput extends WorkspaceFsLocation {
	newName: string;
}

export interface WorkspaceFsDeletePathsInput {
	workspaceId: string;
	absolutePaths: string[];
	permanent?: boolean;
}

export interface WorkspaceFsMoveCopyInput {
	workspaceId: string;
	absolutePaths: string[];
	destinationAbsolutePath: string;
}

export interface WorkspaceFsSearchFilesInput {
	workspaceId: string;
	query: string;
	includeHidden?: boolean;
	includePattern?: string;
	excludePattern?: string;
	limit?: number;
}

export interface WorkspaceFsWatchInput {
	workspaceId: string;
}

export interface WorkspaceFsQueryService {
	listDirectory(input: WorkspaceFsDirectoryQuery): Promise<WorkspaceFsEntry[]>;
	readTextFile(input: WorkspaceFsLocation): Promise<string>;
	readFileBuffer(input: WorkspaceFsLocation): Promise<Uint8Array>;
	stat(input: WorkspaceFsLocation): Promise<WorkspaceFsStat>;
	exists(input: WorkspaceFsLocation): Promise<WorkspaceFsExistsResult>;
}

export interface WorkspaceFsMutationService {
	writeTextFile(input: WorkspaceFsWriteFileInput): Promise<void>;
	createFile(
		input: WorkspaceFsCreateFileInput,
	): Promise<{ absolutePath: string }>;
	createDirectory(
		input: WorkspaceFsCreateDirectoryInput,
	): Promise<{ absolutePath: string }>;
	rename(
		input: WorkspaceFsRenameInput,
	): Promise<{ oldAbsolutePath: string; newAbsolutePath: string }>;
	deletePaths(input: WorkspaceFsDeletePathsInput): Promise<DeletePathsResult>;
	movePaths(input: WorkspaceFsMoveCopyInput): Promise<MoveCopyResult>;
	copyPaths(input: WorkspaceFsMoveCopyInput): Promise<MoveCopyResult>;
}

export interface WorkspaceFsSearchService {
	searchFiles(
		input: WorkspaceFsSearchFilesInput,
	): Promise<WorkspaceFsSearchResult[]>;
	searchKeyword(
		input: WorkspaceFsSearchFilesInput,
	): Promise<WorkspaceFsKeywordMatch[]>;
}

export interface WorkspaceFsWatchService {
	watchWorkspace(
		input: WorkspaceFsWatchInput,
	): AsyncIterable<WorkspaceFsWatchEvent>;
}

export interface WorkspaceFsService
	extends WorkspaceFsQueryService,
		WorkspaceFsMutationService,
		WorkspaceFsSearchService,
		WorkspaceFsWatchService {}
