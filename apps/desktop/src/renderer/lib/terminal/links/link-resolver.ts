/*---------------------------------------------------------------------------------------------
 *  Adapted from VSCode's terminalLinkResolver.ts
 *  https://github.com/microsoft/vscode/blob/main/src/vs/workbench/contrib/terminalContrib/links/browser/terminalLinkResolver.ts
 *
 *  Resolves terminal link paths against the filesystem with TTL caching.
 *--------------------------------------------------------------------------------------------*/

import {
	removeLinkQueryString,
	removeLinkSuffix,
} from "@superset/shared/terminal-link-parsing";
import * as nodePath from "node:path";

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
 * Context needed to resolve relative and tilde paths.
 */
export interface LinkResolverOptions {
	/** The initial CWD of the terminal session. */
	initialCwd: string | undefined;
	/** The user's home directory. */
	userHome: string | undefined;
}

/**
 * Callback that checks whether a path exists on disk.
 * Return `{ isDirectory }` if the path exists, or `null` if it doesn't.
 * May throw on I/O errors — the resolver will catch and treat as non-existent.
 */
export type StatCallback = (
	path: string,
) => Promise<{ isDirectory: boolean } | null>;

interface CacheEntry {
	value: ResolvedLink | null;
}

const DEFAULT_CACHE_TTL_MS = 10_000;

export interface TerminalLinkResolverConfig {
	cacheTtlMs?: number;
}

/**
 * Resolves terminal link text to absolute paths, validating against the
 * filesystem via a stat callback. Results are cached with a configurable TTL
 * (default 10 seconds) following VSCode's pattern.
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
	 * Resolve a single link string to an absolute path, checking if it exists.
	 */
	async resolveLink(
		link: string,
		opts: LinkResolverOptions,
	): Promise<ResolvedLink | null> {
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

		// Preprocess: resolve file:// URIs, tilde, and relative paths
		const processed = this._preprocessPath(linkPath, opts);
		if (!processed) {
			this._cacheSet(link, null);
			return null;
		}

		// Stat the resolved path
		try {
			const stat = await this._stat(processed);
			if (stat) {
				const result: ResolvedLink = {
					path: processed,
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
	 * This is the pattern used by VSCode's TerminalLocalLinkDetector: it builds
	 * several candidate paths (absolute, relative, trimmed) and validates each.
	 */
	async resolveMultipleCandidates(
		candidates: string[],
		opts: LinkResolverOptions,
	): Promise<ResolvedLink | null> {
		for (const candidate of candidates) {
			const result = await this.resolveLink(candidate, opts);
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
		// Reset TTL on every write — if no new writes arrive within the TTL,
		// the entire cache is cleared. This matches VSCode's LinkCache pattern.
		if (this._cacheTtl !== null) {
			clearTimeout(this._cacheTtl);
		}
		this._cacheTtl = setTimeout(() => {
			this._cache.clear();
			this._cacheTtl = null;
		}, this._ttlMs);

		this._cache.set(key, { value });
	}

	/**
	 * Preprocess a path: resolve file:// URIs, tilde expansion, and relative
	 * paths. Returns null if the path cannot be resolved (e.g. missing CWD for
	 * a relative path).
	 */
	private _preprocessPath(
		link: string,
		opts: LinkResolverOptions,
	): string | null {
		let result = link;

		// Handle file:// URIs
		if (result.startsWith("file://")) {
			try {
				const url = new URL(result);
				result = decodeURIComponent(url.pathname);
			} catch {
				result = decodeURIComponent(result.replace(/^file:\/\//, ""));
			}
		}

		// Handle tilde expansion
		if (result.startsWith("~")) {
			if (!opts.userHome) {
				return null;
			}
			result = nodePath.join(opts.userHome, result.substring(1));
		}
		// Handle relative paths
		else if (!nodePath.isAbsolute(result)) {
			if (!opts.initialCwd) {
				return null;
			}
			result = nodePath.resolve(opts.initialCwd, result);
		}

		return nodePath.normalize(result);
	}
}
