/*---------------------------------------------------------------------------------------------
 *  Adapted from VSCode's terminalLinkResolver.ts
 *  https://github.com/microsoft/vscode/blob/main/src/vs/workbench/contrib/terminalContrib/links/browser/terminalLinkResolver.ts
 *
 *  Resolves terminal link paths against the filesystem with TTL caching.
 *
 *  Unlike VSCode (which resolves paths in the renderer then routes stat via
 *  URI scheme), we delegate all path resolution to the host service's statPath
 *  endpoint. The renderer only strips suffixes/query strings and handles
 *  file:// URIs before passing the raw path to the stat callback.
 *--------------------------------------------------------------------------------------------*/

import {
	removeLinkQueryString,
	removeLinkSuffix,
} from "@superset/shared/terminal-link-parsing";

/**
 * The result of resolving a link path against the filesystem.
 */
export interface ResolvedLink {
	/** The absolute, resolved path. */
	path: string;
	/** Whether the path points to a directory. */
	isDirectory: boolean;
}

/**
 * Callback that checks whether a path exists on disk.
 *
 * The callback receives a path that may be absolute or relative. The host
 * service resolves relative paths against the workspace root, tilde paths
 * against $HOME, etc. — all resolution happens server-side.
 *
 * Return `{ isDirectory, resolvedPath? }` if the path exists, or `null` if
 * it doesn't. `resolvedPath` allows the host to report the final absolute
 * path after server-side resolution.
 */
export type StatCallback = (
	path: string,
) => Promise<{ isDirectory: boolean; resolvedPath?: string } | null>;

interface CacheEntry {
	value: ResolvedLink | null;
}

const DEFAULT_CACHE_TTL_MS = 10_000;

export interface TerminalLinkResolverConfig {
	cacheTtlMs?: number;
}

/**
 * Validates terminal link paths against the filesystem via a stat callback.
 * Results are cached with a configurable TTL (default 10 seconds) following
 * VSCode's pattern.
 *
 * Path resolution (relative, tilde, etc.) is handled by the stat callback
 * (host service), not the renderer. The resolver only strips link suffixes
 * and handles file:// URI decoding.
 */
export class TerminalLinkResolver {
	private readonly _cache = new Map<string, CacheEntry>();
	private _cacheTtl: ReturnType<typeof setTimeout> | null = null;
	private readonly _ttlMs: number;

	constructor(
		private readonly _stat: StatCallback,
		config?: TerminalLinkResolverConfig,
	) {
		this._ttlMs = config?.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS;
	}

	/**
	 * Resolve a single link string, checking if it exists via the stat callback.
	 */
	async resolveLink(link: string): Promise<ResolvedLink | null> {
		if (!link || !link.trim()) {
			return null;
		}

		// Check cache first
		const cached = this._cache.get(link);
		if (cached !== undefined) {
			return cached.value;
		}

		// Strip line/column suffix and query string for path resolution
		let linkPath = removeLinkSuffix(link);
		linkPath = removeLinkQueryString(linkPath);

		if (!linkPath) {
			this._cacheSet(link, null);
			return null;
		}

		// Handle file:// URIs (decode to plain path)
		if (linkPath.startsWith("file://")) {
			try {
				const url = new URL(linkPath);
				linkPath = decodeURIComponent(url.pathname);
			} catch {
				try {
					linkPath = decodeURIComponent(linkPath.replace(/^file:\/\//, ""));
				} catch {
					// Malformed URI — use as-is with scheme stripped
					linkPath = linkPath.replace(/^file:\/\//, "");
				}
			}
		}

		// Pass the path to the stat callback. The host service handles all
		// resolution (relative → workspace root, ~ → $HOME, etc.)
		try {
			const stat = await this._stat(linkPath);
			if (stat) {
				const result: ResolvedLink = {
					path: stat.resolvedPath ?? linkPath,
					isDirectory: stat.isDirectory,
				};
				this._cacheSet(link, result);
				return result;
			}
			this._cacheSet(link, null);
			return null;
		} catch {
			this._cacheSet(link, null);
			return null;
		}
	}

	/**
	 * Try multiple path candidates in order, returning the first one that exists.
	 */
	async resolveMultipleCandidates(
		candidates: string[],
	): Promise<ResolvedLink | null> {
		for (const candidate of candidates) {
			const result = await this.resolveLink(candidate);
			if (result) {
				return result;
			}
		}
		return null;
	}

	/**
	 * Clear the cache (for testing or when the terminal CWD changes).
	 */
	clearCache(): void {
		this._cache.clear();
		if (this._cacheTtl !== null) {
			clearTimeout(this._cacheTtl);
			this._cacheTtl = null;
		}
	}

	private _cacheSet(key: string, value: ResolvedLink | null): void {
		if (this._cacheTtl !== null) {
			clearTimeout(this._cacheTtl);
		}
		this._cacheTtl = setTimeout(() => {
			this._cache.clear();
			this._cacheTtl = null;
		}, this._ttlMs);

		this._cache.set(key, { value });
	}
}
