import type { GitChangesStatus } from "shared/changes-types";

const STATUS_CACHE_TTL_MS = 2_000;

const statusCache = new Map<
	string,
	{ result: GitChangesStatus; timestamp: number }
>();
const inFlightStatus = new Map<string, Promise<GitChangesStatus>>();

export function makeStatusCacheKey(
	worktreePath: string,
	defaultBranch: string,
): string {
	return `${worktreePath}:${defaultBranch}`;
}

export function getCachedStatus(cacheKey: string): GitChangesStatus | null {
	const cached = statusCache.get(cacheKey);
	if (!cached) return null;
	if (Date.now() - cached.timestamp >= STATUS_CACHE_TTL_MS) {
		statusCache.delete(cacheKey);
		return null;
	}
	return cached.result;
}

export function setCachedStatus(
	cacheKey: string,
	result: GitChangesStatus,
): void {
	statusCache.set(cacheKey, { result, timestamp: Date.now() });
}

export function getInFlightStatus(
	cacheKey: string,
): Promise<GitChangesStatus> | null {
	return inFlightStatus.get(cacheKey) ?? null;
}

export function setInFlightStatus(
	cacheKey: string,
	promise: Promise<GitChangesStatus>,
): void {
	inFlightStatus.set(cacheKey, promise);
}

export function clearInFlightStatus(cacheKey: string): void {
	inFlightStatus.delete(cacheKey);
}

export function clearStatusCacheForWorktree(worktreePath: string): void {
	const prefix = `${worktreePath}:`;

	for (const key of statusCache.keys()) {
		if (key.startsWith(prefix)) {
			statusCache.delete(key);
		}
	}

	for (const key of inFlightStatus.keys()) {
		if (key.startsWith(prefix)) {
			inFlightStatus.delete(key);
		}
	}
}
