/*---------------------------------------------------------------------------------------------
 *  Link resolver with caching, path resolution, and validation.
 *  Inspired by VSCode's terminalLinkResolver.ts
 *--------------------------------------------------------------------------------------------*/

import {
	generateTrimmedCandidates,
	type IFallbackLink,
} from "./fallback-matchers";
import type { ILinkSuffix, IParsedLink } from "./link-parsing";

/**
 * Result of resolving a link.
 */
export interface IResolvedLink {
	/** The resolved absolute path */
	path: string;
	/** Whether the path exists */
	exists: boolean;
	/** Whether the path is a directory */
	isDirectory: boolean;
	/** Line number from the link suffix */
	line?: number;
	/** Column number from the link suffix */
	column?: number;
	/** End line for range selections */
	lineEnd?: number;
	/** End column for range selections */
	columnEnd?: number;
}

/**
 * Options for the link resolver.
 */
export interface ILinkResolverOptions {
	/** The current working directory for resolving relative paths */
	cwd?: string;
	/** The user's home directory for resolving ~ */
	userHome?: string;
	/** Function to check if a path exists and get its stats */
	pathExists: (
		path: string,
	) => Promise<{ exists: boolean; isDirectory: boolean }>;
	/** Optional: join path segments (defaults to simple concatenation with /) */
	joinPath?: (...segments: string[]) => string;
	/** Optional: normalize a path */
	normalizePath?: (path: string) => string;
	/** Optional: check if a path is absolute */
	isAbsolute?: (path: string) => boolean;
}

/**
 * Default path utilities for non-Node environments.
 */
const defaultJoinPath = (...segments: string[]): string => {
	return segments.join("/").replace(/\/+/g, "/").replace(/\/$/, "");
};

const defaultNormalizePath = (path: string): string => {
	// Simple normalization: remove . and resolve ..
	const parts = path.split("/");
	const result: string[] = [];

	for (const part of parts) {
		if (part === "..") {
			result.pop();
		} else if (part !== "." && part !== "") {
			result.push(part);
		}
	}

	// Preserve leading slash for absolute paths
	const prefix = path.startsWith("/") ? "/" : "";
	return prefix + result.join("/");
};

const defaultIsAbsolute = (path: string): boolean => {
	return path.startsWith("/") || /^[a-zA-Z]:[\\/]/.test(path);
};

/**
 * Cache entry for resolved links.
 */
interface ICacheEntry {
	result: IResolvedLink | null;
	timestamp: number;
}

/** How long to cache resolved links (10 seconds) */
const CACHE_TTL_MS = 10_000;

/** Maximum number of links to resolve per line */
const MAX_RESOLVED_LINKS_PER_LINE = 10;

/** Maximum path length to attempt resolution */
const MAX_PATH_LENGTH = 1024;

/**
 * A link resolver that handles path resolution, caching, and validation.
 */
export class LinkResolver {
	private readonly cache = new Map<string, ICacheEntry>();
	private cacheCleanupTimer: ReturnType<typeof setTimeout> | null = null;

	private readonly joinPath: (...segments: string[]) => string;
	private readonly normalizePath: (path: string) => string;
	private readonly isAbsolute: (path: string) => boolean;

	constructor(private readonly options: ILinkResolverOptions) {
		this.joinPath = options.joinPath ?? defaultJoinPath;
		this.normalizePath = options.normalizePath ?? defaultNormalizePath;
		this.isAbsolute = options.isAbsolute ?? defaultIsAbsolute;
	}

	/**
	 * Update the resolver options (e.g., when cwd changes).
	 */
	updateOptions(newOptions: Partial<ILinkResolverOptions>): void {
		Object.assign(this.options, newOptions);
		// Clear cache when options change as paths may resolve differently
		this.clearCache();
	}

	/**
	 * Clear the link cache.
	 */
	clearCache(): void {
		this.cache.clear();
		if (this.cacheCleanupTimer) {
			clearTimeout(this.cacheCleanupTimer);
			this.cacheCleanupTimer = null;
		}
	}

	/**
	 * Resolve a parsed link to an absolute path and validate it exists.
	 */
	async resolveLink(parsedLink: IParsedLink): Promise<IResolvedLink | null> {
		const pathText = parsedLink.path.text;

		// Skip paths that are too long
		if (pathText.length > MAX_PATH_LENGTH) {
			return null;
		}

		// Generate candidates: original path + trimmed variants
		const candidates = this.generateCandidates(pathText);

		for (const candidate of candidates) {
			const resolved = await this.resolvePath(candidate);
			if (resolved?.exists) {
				return {
					...resolved,
					line: parsedLink.suffix?.row,
					column: parsedLink.suffix?.col,
					lineEnd: parsedLink.suffix?.rowEnd,
					columnEnd: parsedLink.suffix?.colEnd,
				};
			}
		}

		return null;
	}

	/**
	 * Resolve a fallback link.
	 */
	async resolveFallbackLink(
		fallbackLink: IFallbackLink,
	): Promise<IResolvedLink | null> {
		const pathText = fallbackLink.path;

		if (pathText.length > MAX_PATH_LENGTH) {
			return null;
		}

		const candidates = this.generateCandidates(pathText);

		for (const candidate of candidates) {
			const resolved = await this.resolvePath(candidate);
			if (resolved?.exists) {
				return {
					...resolved,
					line: fallbackLink.line,
					column: fallbackLink.col,
				};
			}
		}

		return null;
	}

	/**
	 * Resolve multiple links, respecting the per-line limit.
	 */
	async resolveLinks(
		parsedLinks: IParsedLink[],
	): Promise<Map<IParsedLink, IResolvedLink>> {
		const results = new Map<IParsedLink, IResolvedLink>();
		let resolvedCount = 0;

		for (const link of parsedLinks) {
			if (resolvedCount >= MAX_RESOLVED_LINKS_PER_LINE) {
				break;
			}

			const resolved = await this.resolveLink(link);
			if (resolved) {
				results.set(link, resolved);
				resolvedCount++;
			}
		}

		return results;
	}

	/**
	 * Generate path candidates including trimmed variants.
	 */
	private generateCandidates(path: string): string[] {
		const candidates = [path];

		// Add trimmed variants
		const trimmed = generateTrimmedCandidates(path);
		for (const t of trimmed) {
			candidates.push(t.path);
		}

		return candidates;
	}

	/**
	 * Resolve a single path and check if it exists.
	 */
	private async resolvePath(
		path: string,
	): Promise<{ path: string; exists: boolean; isDirectory: boolean } | null> {
		// Check cache first
		const cached = this.getCached(path);
		if (cached !== undefined) {
			return cached;
		}

		// Preprocess the path
		const processedPath = this.preprocessPath(path);
		if (!processedPath) {
			this.setCached(path, null);
			return null;
		}

		// Check if the processed path exists
		try {
			const stats = await this.options.pathExists(processedPath);
			const result = {
				path: processedPath,
				exists: stats.exists,
				isDirectory: stats.isDirectory,
			};
			this.setCached(path, result);
			return result;
		} catch {
			this.setCached(path, null);
			return null;
		}
	}

	/**
	 * Preprocess a path by expanding ~ and resolving relative paths.
	 */
	private preprocessPath(path: string): string | null {
		let result = path;

		// Handle tilde expansion
		if (result.startsWith("~")) {
			const { userHome } = this.options;
			if (!userHome) {
				return null;
			}
			result = this.joinPath(userHome, result.slice(1));
		}
		// Handle relative paths
		else if (!this.isAbsolute(result)) {
			const { cwd } = this.options;
			if (!cwd) {
				// Can't resolve relative path without cwd
				return null;
			}
			result = this.joinPath(cwd, result);
		}

		// Normalize the path
		result = this.normalizePath(result);

		return result;
	}

	/**
	 * Get a cached result.
	 */
	private getCached(
		key: string,
	):
		| { path: string; exists: boolean; isDirectory: boolean }
		| null
		| undefined {
		const entry = this.cache.get(key);
		if (!entry) {
			return undefined;
		}

		// Check if cache entry is still valid
		if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
			this.cache.delete(key);
			return undefined;
		}

		return entry.result;
	}

	/**
	 * Set a cached result.
	 */
	private setCached(
		key: string,
		result: { path: string; exists: boolean; isDirectory: boolean } | null,
	): void {
		this.cache.set(key, {
			result,
			timestamp: Date.now(),
		});

		// Schedule cache cleanup
		this.scheduleCacheCleanup();
	}

	/**
	 * Schedule a cache cleanup to remove expired entries.
	 */
	private scheduleCacheCleanup(): void {
		if (this.cacheCleanupTimer) {
			return;
		}

		this.cacheCleanupTimer = setTimeout(() => {
			this.cacheCleanupTimer = null;
			const now = Date.now();

			for (const [key, entry] of this.cache) {
				if (now - entry.timestamp > CACHE_TTL_MS) {
					this.cache.delete(key);
				}
			}
		}, CACHE_TTL_MS);
	}

	/**
	 * Dispose the resolver and clean up resources.
	 */
	dispose(): void {
		this.clearCache();
	}
}

/**
 * Extract line and column info from a link suffix.
 */
export function extractLineColumn(suffix: ILinkSuffix | undefined): {
	line?: number;
	column?: number;
	lineEnd?: number;
	columnEnd?: number;
} {
	if (!suffix) {
		return {};
	}
	return {
		line: suffix.row,
		column: suffix.col,
		lineEnd: suffix.rowEnd,
		columnEnd: suffix.colEnd,
	};
}

/**
 * Decode URL-encoded characters in a path.
 * Common encodings: %3A -> :, %20 -> space, %2F -> /
 */
export function decodeUrlEncodedPath(path: string): string {
	try {
		if (path.includes("%")) {
			return decodeURIComponent(path);
		}
		return path;
	} catch {
		// If decoding fails (malformed %), return original path
		return path;
	}
}

/**
 * Parse line and column from a decoded URL-encoded path.
 * Useful when the original path had encoded colons like %3A.
 */
export function parseLineColumnFromPath(path: string): {
	path: string;
	line?: number;
	column?: number;
} {
	const match = path.match(/:(\d+)(?::(\d+))?$/);
	if (!match || !match[1]) {
		return { path };
	}

	return {
		path: path.replace(/:(\d+)(?::(\d+))?$/, ""),
		line: Number.parseInt(match[1], 10),
		column: match[2] ? Number.parseInt(match[2], 10) : undefined,
	};
}
