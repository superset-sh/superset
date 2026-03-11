export type {
	WorkspaceFsCapabilities,
	WorkspaceFsCreateDirectoryInput,
	WorkspaceFsCreateFileInput,
	WorkspaceFsDeletePathsInput,
	WorkspaceFsDirectoryQuery,
	WorkspaceFsHostKind,
	WorkspaceFsLimitedReadInput,
	WorkspaceFsLocation,
	WorkspaceFsMoveCopyInput,
	WorkspaceFsMutationService,
	WorkspaceFsQueryService,
	WorkspaceFsRenameInput,
	WorkspaceFsRequestMap,
	WorkspaceFsSearchFilesInput,
	WorkspaceFsSearchService,
	WorkspaceFsService,
	WorkspaceFsServiceInfo,
	WorkspaceFsSubscriptionMap,
	WorkspaceFsWatchInput,
	WorkspaceFsWatchService,
	WorkspaceFsWriteFileInput,
} from "../core/service";

import type {
	WorkspaceFsRequestMap,
	WorkspaceFsService,
	WorkspaceFsSubscriptionMap,
} from "../core/service";

export interface WorkspaceFsClientTransport {
	request<TKey extends keyof WorkspaceFsRequestMap>(
		method: TKey,
		input: WorkspaceFsRequestMap[TKey]["input"],
	): Promise<WorkspaceFsRequestMap[TKey]["output"]>;
	subscribe<TKey extends keyof WorkspaceFsSubscriptionMap>(
		method: TKey,
		input: WorkspaceFsSubscriptionMap[TKey]["input"],
	): AsyncIterable<WorkspaceFsSubscriptionMap[TKey]["event"]>;
}

export function createWorkspaceFsClient(
	transport: WorkspaceFsClientTransport,
): WorkspaceFsService {
	return {
		async getServiceInfo() {
			return await transport.request("getServiceInfo", undefined);
		},
		async listDirectory(input) {
			return await transport.request("listDirectory", input);
		},
		async readTextFile(input) {
			return await transport.request("readTextFile", input);
		},
		async readFileBuffer(input) {
			return await transport.request("readFileBuffer", input);
		},
		async readFileBufferUpTo(input) {
			return await transport.request("readFileBufferUpTo", input);
		},
		async stat(input) {
			return await transport.request("stat", input);
		},
		async exists(input) {
			return await transport.request("exists", input);
		},
		async writeTextFile(input) {
			await transport.request("writeTextFile", input);
		},
		async guardedWriteTextFile(input) {
			return await transport.request("guardedWriteTextFile", input);
		},
		async createFile(input) {
			return await transport.request("createFile", input);
		},
		async createDirectory(input) {
			return await transport.request("createDirectory", input);
		},
		async rename(input) {
			return await transport.request("rename", input);
		},
		async deletePaths(input) {
			return await transport.request("deletePaths", input);
		},
		async movePaths(input) {
			return await transport.request("movePaths", input);
		},
		async copyPaths(input) {
			return await transport.request("copyPaths", input);
		},
		async searchFiles(input) {
			return await transport.request("searchFiles", input);
		},
		async searchKeyword(input) {
			return await transport.request("searchKeyword", input);
		},
		watchWorkspace(input) {
			return transport.subscribe("watchWorkspace", input);
		},
	};
}
