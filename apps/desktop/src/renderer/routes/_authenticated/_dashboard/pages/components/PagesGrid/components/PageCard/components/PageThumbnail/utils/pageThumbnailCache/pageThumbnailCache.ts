import { electronTrpcClient } from "renderer/lib/trpc-client";

const MAX_CACHED_THUMBNAILS = 48;

const urls = new Map<string, string>();
const tokens = new Map<string, string>();
const inflight = new Map<string, Promise<string>>();

let generation = 0;

export class ThumbnailCacheClearedError extends Error {
	constructor() {
		super("Page preview cache was cleared while the preview was loading");
		this.name = "ThumbnailCacheClearedError";
	}
}

export function thumbnailCacheKey(pageId: string, version: number): string {
	return `${pageId}:${version}`;
}

export function getCachedThumbnailUrl(key: string): string | undefined {
	const url = urls.get(key);
	if (url === undefined) return undefined;
	urls.delete(key);
	urls.set(key, url);
	return url;
}

function releaseToken(token: string): void {
	void electronTrpcClient.pageContent.release.mutate({ token });
}

function evictOverflow(): void {
	while (urls.size > MAX_CACHED_THUMBNAILS) {
		const oldest = urls.keys().next().value;
		if (oldest === undefined) return;
		urls.delete(oldest);
		const token = tokens.get(oldest);
		tokens.delete(oldest);
		if (token) releaseToken(token);
	}
}

export function loadThumbnailUrl(
	key: string,
	fetchHtml: () => Promise<string>,
): Promise<string> {
	const cached = getCachedThumbnailUrl(key);
	if (cached !== undefined) return Promise.resolve(cached);

	const existing = inflight.get(key);
	if (existing) return existing;

	const startedAt = generation;

	const pending: Promise<string> = (async () => {
		const html = await fetchHtml();
		const { token, url } = await electronTrpcClient.pageContent.register.mutate(
			{ html },
		);
		if (startedAt !== generation) {
			releaseToken(token);
			throw new ThumbnailCacheClearedError();
		}
		urls.set(key, url);
		tokens.set(key, token);
		evictOverflow();
		return url;
	})().finally(() => {
		if (inflight.get(key) === pending) inflight.delete(key);
	});

	inflight.set(key, pending);
	return pending;
}

export function clearThumbnailCache(): void {
	generation += 1;
	for (const token of tokens.values()) releaseToken(token);
	urls.clear();
	tokens.clear();
	inflight.clear();
}
