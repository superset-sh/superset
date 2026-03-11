import type {
	DeletePathsResult,
	MoveCopyResult,
	WorkspaceFsEntry,
	WorkspaceFsExistsResult,
	WorkspaceFsGuardedWriteResult,
	WorkspaceFsKeywordMatch,
	WorkspaceFsLimitedReadResult,
	WorkspaceFsSearchResult,
	WorkspaceFsStat,
	WorkspaceFsWatchEvent,
} from "../types";
import { WORKSPACE_FS_RESOURCE_SCHEME } from "./resource-uri";

export type WorkspaceFsHostKind = "local" | "remote";

export interface WorkspaceFsCapabilities {
	read: boolean;
	write: boolean;
	watch: boolean;
	searchFiles: boolean;
	searchKeyword: boolean;
	trash: boolean;
	resourceUris: boolean;
}

export interface WorkspaceFsServiceInfo {
	hostKind: WorkspaceFsHostKind;
	resourceScheme: string;
	pathIdentity: "absolute-path";
	capabilities: WorkspaceFsCapabilities;
}

export interface WorkspaceFsLocation {
	workspaceId: string;
	absolutePath: string;
}

export interface WorkspaceFsDirectoryQuery extends WorkspaceFsLocation {}

export interface WorkspaceFsWriteFileInput extends WorkspaceFsLocation {
	content: string;
	expectedContent?: string;
}

export interface WorkspaceFsLimitedReadInput extends WorkspaceFsLocation {
	maxBytes: number;
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

export interface WorkspaceFsServiceMetadata {
	getServiceInfo(): Promise<WorkspaceFsServiceInfo>;
}

export interface WorkspaceFsQueryService {
	listDirectory(input: WorkspaceFsDirectoryQuery): Promise<WorkspaceFsEntry[]>;
	readTextFile(input: WorkspaceFsLocation): Promise<string>;
	readFileBuffer(input: WorkspaceFsLocation): Promise<Uint8Array>;
	readFileBufferUpTo(
		input: WorkspaceFsLimitedReadInput,
	): Promise<WorkspaceFsLimitedReadResult>;
	stat(input: WorkspaceFsLocation): Promise<WorkspaceFsStat>;
	exists(input: WorkspaceFsLocation): Promise<WorkspaceFsExistsResult>;
}

export interface WorkspaceFsMutationService {
	writeTextFile(input: WorkspaceFsWriteFileInput): Promise<void>;
	guardedWriteTextFile(
		input: WorkspaceFsWriteFileInput,
	): Promise<WorkspaceFsGuardedWriteResult>;
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
	extends WorkspaceFsServiceMetadata,
		WorkspaceFsQueryService,
		WorkspaceFsMutationService,
		WorkspaceFsSearchService,
		WorkspaceFsWatchService {}

export interface WorkspaceFsRequestMap {
	getServiceInfo: {
		input: undefined;
		output: WorkspaceFsServiceInfo;
	};
	listDirectory: {
		input: WorkspaceFsDirectoryQuery;
		output: WorkspaceFsEntry[];
	};
	readTextFile: {
		input: WorkspaceFsLocation;
		output: string;
	};
	readFileBuffer: {
		input: WorkspaceFsLocation;
		output: Uint8Array;
	};
	readFileBufferUpTo: {
		input: WorkspaceFsLimitedReadInput;
		output: WorkspaceFsLimitedReadResult;
	};
	stat: {
		input: WorkspaceFsLocation;
		output: WorkspaceFsStat;
	};
	exists: {
		input: WorkspaceFsLocation;
		output: WorkspaceFsExistsResult;
	};
	writeTextFile: {
		input: WorkspaceFsWriteFileInput;
		output: undefined;
	};
	guardedWriteTextFile: {
		input: WorkspaceFsWriteFileInput;
		output: WorkspaceFsGuardedWriteResult;
	};
	createFile: {
		input: WorkspaceFsCreateFileInput;
		output: { absolutePath: string };
	};
	createDirectory: {
		input: WorkspaceFsCreateDirectoryInput;
		output: { absolutePath: string };
	};
	rename: {
		input: WorkspaceFsRenameInput;
		output: { oldAbsolutePath: string; newAbsolutePath: string };
	};
	deletePaths: {
		input: WorkspaceFsDeletePathsInput;
		output: DeletePathsResult;
	};
	movePaths: {
		input: WorkspaceFsMoveCopyInput;
		output: MoveCopyResult;
	};
	copyPaths: {
		input: WorkspaceFsMoveCopyInput;
		output: MoveCopyResult;
	};
	searchFiles: {
		input: WorkspaceFsSearchFilesInput;
		output: WorkspaceFsSearchResult[];
	};
	searchKeyword: {
		input: WorkspaceFsSearchFilesInput;
		output: WorkspaceFsKeywordMatch[];
	};
}

export interface WorkspaceFsSubscriptionMap {
	watchWorkspace: {
		input: WorkspaceFsWatchInput;
		event: WorkspaceFsWatchEvent;
	};
}

export const DEFAULT_WORKSPACE_FS_SERVICE_INFO: WorkspaceFsServiceInfo = {
	hostKind: "local",
	resourceScheme: WORKSPACE_FS_RESOURCE_SCHEME,
	pathIdentity: "absolute-path",
	capabilities: {
		read: true,
		write: true,
		watch: true,
		searchFiles: true,
		searchKeyword: true,
		trash: true,
		resourceUris: true,
	},
};
