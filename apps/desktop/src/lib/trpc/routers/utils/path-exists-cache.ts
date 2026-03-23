import { existsSync } from "node:fs";

const PATH_EXISTS_CACHE_TTL_MS = 500;
const MAX_PATH_EXISTS_CACHE_ENTRIES = 1024;

interface PathExistsCacheEntry {
	exists: boolean;
	expiresAt: number;
}

const pathExistsCache = new Map<string, PathExistsCacheEntry>();

export function pathExistsCached(path: string): boolean {
	const now = Date.now();
	const cached = pathExistsCache.get(path);
	if (cached && cached.expiresAt > now) {
		return cached.exists;
	}

	const exists = existsSync(path);
	if (pathExistsCache.size >= MAX_PATH_EXISTS_CACHE_ENTRIES) {
		pathExistsCache.clear();
	}
	pathExistsCache.set(path, {
		exists,
		expiresAt: now + PATH_EXISTS_CACHE_TTL_MS,
	});
	return exists;
}

export function clearPathExistsCache(): void {
	pathExistsCache.clear();
}
