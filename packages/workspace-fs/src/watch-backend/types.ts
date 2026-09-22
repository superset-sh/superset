export interface NativeWatchEvent {
	type: "create" | "update" | "delete";
	path: string;
}

export interface NativeWatchSubscription {
	unsubscribe(): Promise<void>;
}

export interface NativeWatchRequest {
	/** Symlink-resolved directory to watch recursively. */
	rootPath: string;
	/** Globs relative to `rootPath`; an entry with no glob magic is a path under it. */
	ignore: string[];
	/** Unique per attach of one watcher; grows on every re-attach. */
	generation: number;
	onEvents(events: NativeWatchEvent[]): void;
	onError(error: unknown): void;
}

export interface NativeWatchBackend {
	readonly name: string;
	/** Resolves once the watch is live; rejects if it could not be established. */
	subscribe(request: NativeWatchRequest): Promise<NativeWatchSubscription>;
}
