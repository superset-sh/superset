import type {
	FsContentMatch,
	FsEntry,
	FsMetadata,
	FsReadResult,
	FsSearchMatch,
	FsWatchEvent,
	FsWriteResult,
} from "../types";

export interface FsService {
	listDirectory(input: {
		absolutePath: string;
	}): Promise<{ entries: FsEntry[] }>;

	readFile(input: {
		absolutePath: string;
		offset?: number;
		maxBytes?: number;
		encoding?: string;
	}): Promise<FsReadResult>;

	getMetadata(input: { absolutePath: string }): Promise<FsMetadata | null>;

	writeFile(input: {
		absolutePath: string;
		content: string | Uint8Array;
		encoding?: string;
		options?: { create: boolean; overwrite: boolean };
		precondition?: { ifMatch: string };
	}): Promise<FsWriteResult>;

	createDirectory(input: {
		absolutePath: string;
		recursive?: boolean;
	}): Promise<{ absolutePath: string; kind: "directory" }>;

	deletePath(input: {
		absolutePath: string;
		permanent?: boolean;
	}): Promise<{ absolutePath: string }>;

	movePath(input: {
		sourceAbsolutePath: string;
		destinationAbsolutePath: string;
	}): Promise<{ fromAbsolutePath: string; toAbsolutePath: string }>;

	copyPath(input: {
		sourceAbsolutePath: string;
		destinationAbsolutePath: string;
	}): Promise<{ fromAbsolutePath: string; toAbsolutePath: string }>;

	searchFiles(input: {
		query: string;
		includeHidden?: boolean;
		includePattern?: string;
		excludePattern?: string;
		limit?: number;
	}): Promise<{ matches: FsSearchMatch[] }>;

	searchContent(input: {
		query: string;
		includeHidden?: boolean;
		includePattern?: string;
		excludePattern?: string;
		limit?: number;
	}): Promise<{ matches: FsContentMatch[] }>;

	watchPath(input: {
		absolutePath: string;
		recursive?: boolean;
	}): AsyncIterable<{ events: FsWatchEvent[] }>;
}

export interface FsRequestMap {
	listDirectory: {
		input: { absolutePath: string };
		output: { entries: FsEntry[] };
	};
	readFile: {
		input: {
			absolutePath: string;
			offset?: number;
			maxBytes?: number;
			encoding?: string;
		};
		output: FsReadResult;
	};
	getMetadata: {
		input: { absolutePath: string };
		output: FsMetadata | null;
	};
	writeFile: {
		input: {
			absolutePath: string;
			content: string | Uint8Array;
			encoding?: string;
			options?: { create: boolean; overwrite: boolean };
			precondition?: { ifMatch: string };
		};
		output: FsWriteResult;
	};
	createDirectory: {
		input: { absolutePath: string; recursive?: boolean };
		output: { absolutePath: string; kind: "directory" };
	};
	deletePath: {
		input: { absolutePath: string; permanent?: boolean };
		output: { absolutePath: string };
	};
	movePath: {
		input: {
			sourceAbsolutePath: string;
			destinationAbsolutePath: string;
		};
		output: { fromAbsolutePath: string; toAbsolutePath: string };
	};
	copyPath: {
		input: {
			sourceAbsolutePath: string;
			destinationAbsolutePath: string;
		};
		output: { fromAbsolutePath: string; toAbsolutePath: string };
	};
	searchFiles: {
		input: {
			query: string;
			includeHidden?: boolean;
			includePattern?: string;
			excludePattern?: string;
			limit?: number;
		};
		output: { matches: FsSearchMatch[] };
	};
	searchContent: {
		input: {
			query: string;
			includeHidden?: boolean;
			includePattern?: string;
			excludePattern?: string;
			limit?: number;
		};
		output: { matches: FsContentMatch[] };
	};
}

export interface FsSubscriptionMap {
	watchPath: {
		input: { absolutePath: string; recursive?: boolean };
		event: { events: FsWatchEvent[] };
	};
}
