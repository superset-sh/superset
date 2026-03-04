import path from "node:path";
import fg from "fast-glob";
import Fuse from "fuse.js";

const SEARCH_INDEX_TTL_MS = 30_000;
const MAX_SEARCH_RESULTS = 500;
const DEFAULT_IGNORE_PATTERNS = [
	"**/node_modules/**",
	"**/.git/**",
	"**/dist/**",
	"**/build/**",
	"**/.next/**",
	"**/.turbo/**",
	"**/coverage/**",
];

export interface FileSearchItem {
	id: string;
	name: string;
	relativePath: string;
	path: string;
	isDirectory: boolean;
}

export interface FileSearchResult extends FileSearchItem {
	score: number;
}

interface FileSearchIndex {
	items: FileSearchItem[];
	fuse: Fuse<FileSearchItem>;
}

interface FileSearchCacheEntry {
	index: FileSearchIndex;
	builtAt: number;
}

const searchIndexCache = new Map<string, FileSearchCacheEntry>();
const searchIndexBuilds = new Map<string, Promise<FileSearchIndex>>();

function getSearchCacheKey({
	rootPath,
	includeHidden,
}: {
	rootPath: string;
	includeHidden: boolean;
}) {
	return `${rootPath}::${includeHidden ? "hidden" : "visible"}`;
}

async function buildSearchIndex({
	rootPath,
	includeHidden,
}: {
	rootPath: string;
	includeHidden: boolean;
}): Promise<FileSearchIndex> {
	const entries = await fg("**/*", {
		cwd: rootPath,
		onlyFiles: true,
		dot: includeHidden,
		followSymbolicLinks: false,
		unique: true,
		suppressErrors: true,
		ignore: DEFAULT_IGNORE_PATTERNS,
	});

	const items = entries.map((relativePath) => ({
		id: relativePath,
		name: path.basename(relativePath),
		relativePath,
		path: path.join(rootPath, relativePath),
		isDirectory: false,
	}));

	const fuse = new Fuse(items, {
		keys: [
			{ name: "name", weight: 2 },
			{ name: "relativePath", weight: 1 },
		],
		threshold: 0.4,
		includeScore: true,
		ignoreLocation: true,
	});

	return { items, fuse };
}

async function getSearchIndex({
	rootPath,
	includeHidden,
}: {
	rootPath: string;
	includeHidden: boolean;
}): Promise<FileSearchIndex> {
	const cacheKey = getSearchCacheKey({ rootPath, includeHidden });
	const cached = searchIndexCache.get(cacheKey);
	const now = Date.now();
	const inFlight = searchIndexBuilds.get(cacheKey);

	if (cached && now - cached.builtAt < SEARCH_INDEX_TTL_MS) {
		return cached.index;
	}

	if (cached && !inFlight) {
		const buildPromise = buildSearchIndex({ rootPath, includeHidden })
			.then((index) => {
				searchIndexCache.set(cacheKey, { index, builtAt: Date.now() });
				searchIndexBuilds.delete(cacheKey);
				return index;
			})
			.catch((error) => {
				searchIndexBuilds.delete(cacheKey);
				throw error;
			});
		searchIndexBuilds.set(cacheKey, buildPromise);
		return cached.index;
	}

	if (cached) {
		return cached.index;
	}

	if (inFlight) {
		return await inFlight;
	}

	const buildPromise = buildSearchIndex({ rootPath, includeHidden })
		.then((index) => {
			searchIndexCache.set(cacheKey, { index, builtAt: Date.now() });
			searchIndexBuilds.delete(cacheKey);
			return index;
		})
		.catch((error) => {
			searchIndexBuilds.delete(cacheKey);
			throw error;
		});
	searchIndexBuilds.set(cacheKey, buildPromise);

	return await buildPromise;
}

export interface SearchFilesOptions {
	rootPath: string;
	query: string;
	includeHidden?: boolean;
	limit?: number;
}

export async function searchFiles({
	rootPath,
	query,
	includeHidden = false,
	limit = 20,
}: SearchFilesOptions): Promise<FileSearchResult[]> {
	const trimmedQuery = query.trim();
	if (!trimmedQuery) return [];

	const index = await getSearchIndex({ rootPath, includeHidden });
	const safeLimit = Math.max(1, Math.min(limit, MAX_SEARCH_RESULTS));
	const results = index.fuse.search(trimmedQuery, { limit: safeLimit });

	return results.map((result) => ({
		id: result.item.id,
		name: result.item.name,
		relativePath: result.item.relativePath,
		path: result.item.path,
		isDirectory: false,
		score: 1 - (result.score ?? 0),
	}));
}
