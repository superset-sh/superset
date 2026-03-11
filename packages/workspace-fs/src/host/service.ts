import {
	DEFAULT_WORKSPACE_FS_SERVICE_INFO,
	type WorkspaceFsCapabilities,
	type WorkspaceFsMoveCopyInput,
	type WorkspaceFsService,
	type WorkspaceFsServiceInfo,
	type WorkspaceFsWatchInput,
} from "../core/service";
import {
	copyPaths,
	createDirectoryAtPath,
	createFileAtPath,
	deletePaths,
	guardedWriteTextFile,
	listDirectory,
	movePaths,
	pathExists,
	readFileBuffer,
	readFileBufferUpTo,
	readTextFile,
	renamePath,
	statFile,
	writeTextFile,
} from "../fs";
import type { SearchFilesOptions, SearchKeywordOptions } from "../search";
import { searchFiles, searchKeyword } from "../search";
import type { WorkspaceFsStat, WorkspaceFsWatchEvent } from "../types";
import type {
	WorkspaceFsWatcherManager,
	WorkspaceWatchSubscriptionOptions,
} from "../watch";

export interface WorkspaceFsHostService extends WorkspaceFsService {
	getServiceInfo(): Promise<WorkspaceFsServiceInfo>;
	close(): Promise<void>;
}

export interface WorkspaceFsServiceInfoOverrides
	extends Omit<Partial<WorkspaceFsServiceInfo>, "capabilities"> {
	capabilities?: Partial<WorkspaceFsCapabilities>;
}

export interface WorkspaceFsHostServiceOptions {
	resolveRootPath: (workspaceId: string) => string;
	watcherManager?: Pick<WorkspaceFsWatcherManager, "subscribe" | "close">;
	trashItem?: (absolutePath: string) => Promise<void>;
	runRipgrep?: SearchKeywordOptions["runRipgrep"];
	serviceInfo?: WorkspaceFsServiceInfoOverrides;
}

interface AsyncQueueState<T> {
	queue: T[];
	waiters: Array<{
		resolve: (value: IteratorResult<T>) => void;
		reject: (error: unknown) => void;
	}>;
	closed: boolean;
	cleanup: (() => Promise<void>) | null;
}

function createAsyncQueue<T>(
	subscribe: (push: (value: T) => void) => Promise<() => Promise<void>>,
): AsyncIterable<T> {
	const state: AsyncQueueState<T> = {
		queue: [],
		waiters: [],
		closed: false,
		cleanup: null,
	};

	const close = async () => {
		if (state.closed) {
			return;
		}
		state.closed = true;
		const cleanup = state.cleanup;
		state.cleanup = null;
		if (cleanup) {
			await cleanup();
		}
		while (state.waiters.length > 0) {
			state.waiters.shift()?.resolve({
				value: undefined,
				done: true,
			});
		}
	};

	void subscribe((value) => {
		if (state.closed) {
			return;
		}

		const waiter = state.waiters.shift();
		if (waiter) {
			waiter.resolve({ value, done: false });
			return;
		}

		state.queue.push(value);
	})
		.then((cleanup) => {
			if (state.closed) {
				void cleanup().catch((error) => {
					console.error(
						"[workspace-fs/createAsyncQueue] Cleanup after closed subscription failed:",
						error,
					);
				});
				return;
			}
			state.cleanup = cleanup;
		})
		.catch((error) => {
			state.closed = true;
			while (state.waiters.length > 0) {
				state.waiters.shift()?.reject(error);
			}
		});

	return {
		[Symbol.asyncIterator]() {
			return {
				next: async () => {
					if (state.queue.length > 0) {
						const value = state.queue.shift();
						return {
							value,
							done: false,
						} as IteratorResult<T>;
					}

					if (state.closed) {
						return {
							value: undefined,
							done: true,
						} as IteratorResult<T>;
					}

					return await new Promise<IteratorResult<T>>((resolve, reject) => {
						state.waiters.push({ resolve, reject });
					});
				},
				return: async () => {
					await close();
					return {
						value: undefined,
						done: true,
					} as IteratorResult<T>;
				},
			};
		},
	};
}

function toWorkspaceFsStat(
	stats: Awaited<ReturnType<typeof statFile>>,
): WorkspaceFsStat {
	return {
		size: stats.size,
		isDirectory: stats.isDirectory(),
		isFile: stats.isFile(),
		isSymbolicLink: stats.isSymbolicLink(),
		createdAt: stats.birthtime.toISOString(),
		modifiedAt: stats.mtime.toISOString(),
		accessedAt: stats.atime.toISOString(),
	};
}

export function createWorkspaceFsHostService(
	options: WorkspaceFsHostServiceOptions,
): WorkspaceFsHostService {
	const resolveRootPath = (workspaceId: string) =>
		options.resolveRootPath(workspaceId);
	const serviceInfo: WorkspaceFsServiceInfo = {
		...DEFAULT_WORKSPACE_FS_SERVICE_INFO,
		...options.serviceInfo,
		capabilities: {
			...DEFAULT_WORKSPACE_FS_SERVICE_INFO.capabilities,
			...options.serviceInfo?.capabilities,
			watch:
				options.serviceInfo?.capabilities?.watch ??
				Boolean(options.watcherManager),
			trash:
				options.serviceInfo?.capabilities?.trash ?? Boolean(options.trashItem),
		},
	};

	const withRootPath = <T extends { workspaceId: string }>(input: T) => ({
		rootPath: resolveRootPath(input.workspaceId),
	});

	const withMoveCopyRootPath = (input: WorkspaceFsMoveCopyInput) => ({
		rootPath: resolveRootPath(input.workspaceId),
		absolutePaths: input.absolutePaths,
		destinationAbsolutePath: input.destinationAbsolutePath,
	});

	return {
		async getServiceInfo() {
			return serviceInfo;
		},

		async listDirectory(input) {
			return await listDirectory({
				...withRootPath(input),
				absolutePath: input.absolutePath,
			});
		},

		async readTextFile(input) {
			return await readTextFile({
				...withRootPath(input),
				absolutePath: input.absolutePath,
			});
		},

		async readFileBuffer(input) {
			return await readFileBuffer({
				...withRootPath(input),
				absolutePath: input.absolutePath,
			});
		},

		async readFileBufferUpTo(input) {
			return await readFileBufferUpTo({
				...withRootPath(input),
				absolutePath: input.absolutePath,
				maxBytes: input.maxBytes,
			});
		},

		async stat(input) {
			const stats = await statFile({
				...withRootPath(input),
				absolutePath: input.absolutePath,
			});
			return toWorkspaceFsStat(stats);
		},

		async exists(input) {
			return await pathExists({
				...withRootPath(input),
				absolutePath: input.absolutePath,
			});
		},

		async writeTextFile(input) {
			await writeTextFile({
				...withRootPath(input),
				absolutePath: input.absolutePath,
				content: input.content,
			});
		},

		async guardedWriteTextFile(input) {
			return await guardedWriteTextFile({
				...withRootPath(input),
				absolutePath: input.absolutePath,
				content: input.content,
				expectedContent: input.expectedContent,
			});
		},

		async createFile(input) {
			return await createFileAtPath({
				...withRootPath(input),
				absolutePath: input.absolutePath,
				content: input.content,
			});
		},

		async createDirectory(input) {
			return await createDirectoryAtPath({
				...withRootPath(input),
				absolutePath: input.absolutePath,
			});
		},

		async rename(input) {
			return await renamePath({
				...withRootPath(input),
				absolutePath: input.absolutePath,
				newName: input.newName,
			});
		},

		async deletePaths(input) {
			return await deletePaths({
				rootPath: resolveRootPath(input.workspaceId),
				absolutePaths: input.absolutePaths,
				permanent: input.permanent,
				trashItem: options.trashItem,
			});
		},

		async movePaths(input) {
			return await movePaths(withMoveCopyRootPath(input));
		},

		async copyPaths(input) {
			return await copyPaths(withMoveCopyRootPath(input));
		},

		async searchFiles(input) {
			const optionsForSearch: SearchFilesOptions = {
				rootPath: resolveRootPath(input.workspaceId),
				query: input.query,
				includeHidden: input.includeHidden,
				includePattern: input.includePattern,
				excludePattern: input.excludePattern,
				limit: input.limit,
			};
			return await searchFiles(optionsForSearch);
		},

		async searchKeyword(input) {
			const optionsForSearch: SearchKeywordOptions = {
				rootPath: resolveRootPath(input.workspaceId),
				query: input.query,
				includeHidden: input.includeHidden,
				includePattern: input.includePattern,
				excludePattern: input.excludePattern,
				limit: input.limit,
				runRipgrep: options.runRipgrep,
			};
			return await searchKeyword(optionsForSearch);
		},

		watchWorkspace(
			input: WorkspaceFsWatchInput,
		): AsyncIterable<WorkspaceFsWatchEvent> {
			const watcherManager = options.watcherManager;
			if (!watcherManager) {
				throw new Error("watchWorkspace requires a watcher manager");
			}

			const rootPath = resolveRootPath(input.workspaceId);
			return createAsyncQueue<WorkspaceFsWatchEvent>(async (push) => {
				const watchOptions: WorkspaceWatchSubscriptionOptions = {
					workspaceId: input.workspaceId,
					rootPath,
				};
				return await watcherManager.subscribe(watchOptions, push);
			});
		},

		async close() {
			await options.watcherManager?.close();
		},
	};
}
