export type {
	FsRequestMap,
	FsService,
	FsSubscriptionMap,
} from "../core/service";

import type {
	FsRequestMap,
	FsService,
	FsSubscriptionMap,
} from "../core/service";

export interface FsClientTransport {
	request<TKey extends keyof FsRequestMap>(
		method: TKey,
		input: FsRequestMap[TKey]["input"],
	): Promise<FsRequestMap[TKey]["output"]>;
	subscribe<TKey extends keyof FsSubscriptionMap>(
		method: TKey,
		input: FsSubscriptionMap[TKey]["input"],
	): AsyncIterable<FsSubscriptionMap[TKey]["event"]>;
}

export function createFsClient(transport: FsClientTransport): FsService {
	return {
		async listDirectory(input) {
			return await transport.request("listDirectory", input);
		},
		async readFile(input) {
			return await transport.request("readFile", input);
		},
		async getMetadata(input) {
			return await transport.request("getMetadata", input);
		},
		async writeFile(input) {
			return await transport.request("writeFile", input);
		},
		async createDirectory(input) {
			return await transport.request("createDirectory", input);
		},
		async deletePath(input) {
			return await transport.request("deletePath", input);
		},
		async movePath(input) {
			return await transport.request("movePath", input);
		},
		async copyPath(input) {
			return await transport.request("copyPath", input);
		},
		async searchFiles(input) {
			return await transport.request("searchFiles", input);
		},
		async searchContent(input) {
			return await transport.request("searchContent", input);
		},
		watchPath(input) {
			return transport.subscribe("watchPath", input);
		},
	};
}
