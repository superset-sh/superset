import type { FsService } from "../core/service";
import {
	copyPath,
	createDirectory,
	deletePath,
	getMetadata,
	listDirectory,
	movePath,
	readFile,
	writeFile,
} from "../fs";
import type { SearchContentOptions } from "../search";
import { searchContent, searchFiles } from "../search";
import type { FsWatchEvent } from "../types";
import type { FsWatcherManager, WatchPathOptions } from "../watch";

export interface FsHostService extends FsService {
	close(): Promise<void>;
}

export interface FsHostServiceOptions {
	rootPath: string;
	watcherManager?: Pick<FsWatcherManager, "subscribe" | "close">;
	trashItem?: (absolutePath: string) => Promise<void>;
	runRipgrep?: SearchContentOptions["runRipgrep"];
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

export function createFsHostService(
	options: FsHostServiceOptions,
): FsHostService {
	const { rootPath } = options;

	return {
		async listDirectory(input) {
			const entries = await listDirectory({
				rootPath,
				absolutePath: input.absolutePath,
			});
			return { entries };
		},

		async readFile(input) {
			return await readFile({
				rootPath,
				absolutePath: input.absolutePath,
				offset: input.offset,
				maxBytes: input.maxBytes,
				encoding: input.encoding,
			});
		},

		async getMetadata(input) {
			return await getMetadata({
				rootPath,
				absolutePath: input.absolutePath,
			});
		},

		async writeFile(input) {
			return await writeFile({
				rootPath,
				absolutePath: input.absolutePath,
				content: input.content,
				encoding: input.encoding,
				options: input.options,
				precondition: input.precondition,
			});
		},

		async createDirectory(input) {
			return await createDirectory({
				rootPath,
				absolutePath: input.absolutePath,
				recursive: input.recursive,
			});
		},

		async deletePath(input) {
			return await deletePath({
				rootPath,
				absolutePath: input.absolutePath,
				permanent: input.permanent,
				trashItem: options.trashItem,
			});
		},

		async movePath(input) {
			return await movePath({
				rootPath,
				sourceAbsolutePath: input.sourceAbsolutePath,
				destinationAbsolutePath: input.destinationAbsolutePath,
			});
		},

		async copyPath(input) {
			return await copyPath({
				rootPath,
				sourceAbsolutePath: input.sourceAbsolutePath,
				destinationAbsolutePath: input.destinationAbsolutePath,
			});
		},

		async searchFiles(input) {
			const matches = await searchFiles({
				rootPath,
				query: input.query,
				includeHidden: input.includeHidden,
				includePattern: input.includePattern,
				excludePattern: input.excludePattern,
				limit: input.limit,
			});
			return { matches };
		},

		async searchContent(input) {
			const matches = await searchContent({
				rootPath,
				query: input.query,
				includeHidden: input.includeHidden,
				includePattern: input.includePattern,
				excludePattern: input.excludePattern,
				limit: input.limit,
				runRipgrep: options.runRipgrep,
			});
			return { matches };
		},

		watchPath(
			input: WatchPathOptions,
		): AsyncIterable<{ events: FsWatchEvent[] }> {
			const watcherManager = options.watcherManager;
			if (!watcherManager) {
				throw new Error("watchPath requires a watcher manager");
			}

			return createAsyncQueue<{ events: FsWatchEvent[] }>(async (push) => {
				return await watcherManager.subscribe(
					{ absolutePath: input.absolutePath, recursive: input.recursive },
					push,
				);
			});
		},

		async close() {
			await options.watcherManager?.close();
		},
	};
}
