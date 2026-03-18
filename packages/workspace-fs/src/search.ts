import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import fg from "fast-glob";
import Fuse from "fuse.js";
import { normalizeAbsolutePath, toRelativePath } from "./paths";
import type { FsContentMatch, FsSearchMatch } from "./types";

const execFileAsync = promisify(execFile);

const SEARCH_INDEX_TTL_MS = 30_000;
const MAX_SEARCH_RESULTS = 500;
const MAX_KEYWORD_FILE_SIZE_BYTES = 1024 * 1024;
const BINARY_CHECK_SIZE = 8192;
const MAX_PREVIEW_LENGTH = 160;
const KEYWORD_SEARCH_CANDIDATE_MULTIPLIER = 4;
const KEYWORD_SEARCH_MAX_COUNT_PER_FILE = 3;
const KEYWORD_SEARCH_RIPGREP_BUFFER_BYTES = 10 * 1024 * 1024;

export const DEFAULT_IGNORE_PATTERNS = [
	"**/node_modules/**",
	"**/.git/**",
	"**/dist/**",
	"**/build/**",
	"**/.next/**",
	"**/.turbo/**",
	"**/coverage/**",
];

interface SearchIndexEntry {
	absolutePath: string;
	relativePath: string;
	name: string;
}

interface FileSearchIndex {
	items: SearchIndexEntry[];
	fuse: Fuse<SearchIndexEntry>;
}

interface FileSearchCacheEntry {
	index: FileSearchIndex;
	builtAt: number;
}

interface PathFilterMatcher {
	includeMatchers: RegExp[];
	excludeMatchers: RegExp[];
	hasFilters: boolean;
}

interface SearchIndexKeyOptions {
	rootPath: string;
	includeHidden: boolean;
}

interface InternalContentMatch {
	absolutePath: string;
	relativePath: string;
	name: string;
	line: number;
	column: number;
	preview: string;
}

export interface SearchPatchEvent {
	kind: "create" | "update" | "delete" | "rename";
	absolutePath: string;
	oldAbsolutePath?: string;
	isDirectory: boolean;
}

export interface SearchFilesOptions {
	rootPath: string;
	query: string;
	includeHidden?: boolean;
	includePattern?: string;
	excludePattern?: string;
	limit?: number;
}

export interface RunRipgrepOptions {
	cwd: string;
	maxBuffer: number;
}

export interface SearchContentOptions {
	rootPath: string;
	query: string;
	includeHidden?: boolean;
	includePattern?: string;
	excludePattern?: string;
	limit?: number;
	runRipgrep?: (
		args: string[],
		options: RunRipgrepOptions,
	) => Promise<{ stdout: string }>;
}

const searchIndexCache = new Map<string, FileSearchCacheEntry>();
const searchIndexBuilds = new Map<string, Promise<FileSearchIndex>>();
const searchIndexVersions = new Map<string, number>();

function createFileSearchFuse(
	items: SearchIndexEntry[],
): Fuse<SearchIndexEntry> {
	return new Fuse(items, {
		keys: [
			{ name: "name", weight: 2 },
			{ name: "relativePath", weight: 1 },
		],
		threshold: 0.4,
		includeScore: true,
		ignoreLocation: true,
	});
}

function getSearchCacheKey({
	rootPath,
	includeHidden,
}: SearchIndexKeyOptions): string {
	return `${normalizeAbsolutePath(rootPath)}::${includeHidden ? "hidden" : "visible"}`;
}

function getSearchIndexVersion(cacheKey: string): number {
	return searchIndexVersions.get(cacheKey) ?? 0;
}

function advanceSearchIndexVersion(cacheKey: string): number {
	const nextVersion = getSearchIndexVersion(cacheKey) + 1;
	searchIndexVersions.set(cacheKey, nextVersion);
	return nextVersion;
}

function parseGlobPatterns(input: string): string[] {
	return input
		.split(",")
		.map((pattern) => pattern.trim())
		.filter((pattern) => pattern.length > 0)
		.map((pattern) => (pattern.startsWith("!") ? pattern.slice(1) : pattern))
		.filter((pattern) => pattern.length > 0);
}

function normalizePathForGlob(input: string): string {
	let normalized = input.replace(/\\/g, "/");
	if (normalized.startsWith("./")) {
		normalized = normalized.slice(2);
	}
	if (normalized.startsWith("/")) {
		normalized = normalized.slice(1);
	}
	return normalized;
}

function normalizeGlobPattern(pattern: string): string {
	let normalized = normalizePathForGlob(pattern);
	if (normalized.endsWith("/")) {
		normalized = `${normalized}**`;
	}
	if (!normalized.includes("/")) {
		normalized = `**/${normalized}`;
	}
	return normalized;
}

function escapeRegexCharacter(character: string): string {
	return character.replace(/[\\^$.*+?()[\]{}|]/g, "\\$&");
}

function globToRegExp(pattern: string): RegExp {
	const normalizedPattern = normalizeGlobPattern(pattern);
	let regex = "^";

	for (let index = 0; index < normalizedPattern.length; ) {
		const char = normalizedPattern[index];
		if (!char) {
			break;
		}

		if (char === "*") {
			const isDoubleStar = normalizedPattern[index + 1] === "*";
			if (isDoubleStar) {
				if (normalizedPattern[index + 2] === "/") {
					regex += "(?:.*/)?";
					index += 3;
				} else {
					regex += ".*";
					index += 2;
				}
				continue;
			}
			regex += "[^/]*";
			index += 1;
			continue;
		}

		if (char === "?") {
			regex += "[^/]";
			index += 1;
			continue;
		}

		if (char === "/") {
			regex += "\\/";
			index += 1;
			continue;
		}

		regex += escapeRegexCharacter(char);
		index += 1;
	}

	regex += "$";
	return new RegExp(regex);
}

const defaultIgnoreMatchers = DEFAULT_IGNORE_PATTERNS.map(globToRegExp);

function createPathFilterMatcher({
	includePattern,
	excludePattern,
}: {
	includePattern: string;
	excludePattern: string;
}): PathFilterMatcher {
	const includeMatchers = parseGlobPatterns(includePattern).map(globToRegExp);
	const excludeMatchers = parseGlobPatterns(excludePattern).map(globToRegExp);

	return {
		includeMatchers,
		excludeMatchers,
		hasFilters: includeMatchers.length > 0 || excludeMatchers.length > 0,
	};
}

function matchesPathFilters(
	relativePath: string,
	matcher: PathFilterMatcher,
): boolean {
	if (!matcher.hasFilters) {
		return true;
	}

	const normalizedPath = normalizePathForGlob(relativePath);
	if (
		matcher.includeMatchers.length > 0 &&
		!matcher.includeMatchers.some((regex) => regex.test(normalizedPath))
	) {
		return false;
	}

	if (matcher.excludeMatchers.some((regex) => regex.test(normalizedPath))) {
		return false;
	}

	return true;
}

async function buildSearchIndex({
	rootPath,
	includeHidden,
}: SearchIndexKeyOptions): Promise<FileSearchIndex> {
	const normalizedRootPath = normalizeAbsolutePath(rootPath);
	const entries = await fg("**/*", {
		cwd: normalizedRootPath,
		onlyFiles: true,
		dot: includeHidden,
		followSymbolicLinks: false,
		unique: true,
		suppressErrors: true,
		ignore: DEFAULT_IGNORE_PATTERNS,
	});

	const items: SearchIndexEntry[] = entries.map((relativePath) => ({
		absolutePath: path.join(normalizedRootPath, relativePath),
		relativePath,
		name: path.basename(relativePath),
	}));

	return {
		items,
		fuse: createFileSearchFuse(items),
	};
}

async function getSearchIndex(
	options: SearchIndexKeyOptions,
): Promise<FileSearchIndex> {
	const cacheKey = getSearchCacheKey(options);
	const cached = searchIndexCache.get(cacheKey);
	const now = Date.now();
	const inFlight = searchIndexBuilds.get(cacheKey);

	if (cached && now - cached.builtAt < SEARCH_INDEX_TTL_MS) {
		return cached.index;
	}

	if (cached && !inFlight) {
		const buildVersion = getSearchIndexVersion(cacheKey);
		const buildPromise = buildSearchIndex(options)
			.then((index) => {
				if (getSearchIndexVersion(cacheKey) === buildVersion) {
					searchIndexCache.set(cacheKey, { index, builtAt: Date.now() });
				}
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

	const buildVersion = getSearchIndexVersion(cacheKey);
	const buildPromise = buildSearchIndex(options)
		.then((index) => {
			if (getSearchIndexVersion(cacheKey) === buildVersion) {
				searchIndexCache.set(cacheKey, { index, builtAt: Date.now() });
			}
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

function safeSearchLimit(limit: number | undefined): number {
	return Math.max(1, Math.min(limit ?? 20, MAX_SEARCH_RESULTS));
}

function isBinaryContent(buffer: Buffer): boolean {
	const checkLength = Math.min(buffer.length, BINARY_CHECK_SIZE);
	for (let index = 0; index < checkLength; index++) {
		if (buffer[index] === 0) {
			return true;
		}
	}
	return false;
}

function formatPreviewLine(line: string): string {
	const normalized = line.trim();
	if (!normalized) {
		return "";
	}
	if (normalized.length <= MAX_PREVIEW_LENGTH) {
		return normalized;
	}
	return `${normalized.slice(0, MAX_PREVIEW_LENGTH - 3)}...`;
}

function rankContentMatches(
	matches: InternalContentMatch[],
	query: string,
	limit: number,
): InternalContentMatch[] {
	if (matches.length === 0) {
		return [];
	}

	const safeLimit = safeSearchLimit(limit);
	const fuse = new Fuse(matches, {
		keys: [
			{ name: "preview", weight: 2 },
			{ name: "name", weight: 1.2 },
			{ name: "relativePath", weight: 1 },
		],
		threshold: 0.45,
		includeScore: true,
		ignoreLocation: true,
	});

	const ranked = fuse
		.search(query, { limit: safeLimit })
		.map((result) => result.item);
	return ranked.length > 0 ? ranked : matches.slice(0, safeLimit);
}

async function defaultRunRipgrep(
	args: string[],
	options: RunRipgrepOptions,
): Promise<{ stdout: string }> {
	const result = await execFileAsync("rg", args, {
		cwd: options.cwd,
		encoding: "utf8",
		maxBuffer: options.maxBuffer,
		windowsHide: true,
	});

	return { stdout: result.stdout };
}

async function searchContentWithRipgrep({
	rootPath,
	query,
	includeHidden,
	includePattern,
	excludePattern,
	limit,
	runRipgrep,
}: Required<Omit<SearchContentOptions, "runRipgrep">> & {
	runRipgrep: NonNullable<SearchContentOptions["runRipgrep"]>;
}): Promise<InternalContentMatch[]> {
	const safeLimit = safeSearchLimit(limit);
	const maxCandidates = safeLimit * KEYWORD_SEARCH_CANDIDATE_MULTIPLIER;
	const args = [
		"--json",
		"--line-number",
		"--column",
		"--fixed-strings",
		"--smart-case",
		"--no-messages",
		"--max-filesize",
		`${Math.floor(MAX_KEYWORD_FILE_SIZE_BYTES / 1024)}K`,
		"--max-count",
		String(KEYWORD_SEARCH_MAX_COUNT_PER_FILE),
	];

	if (includeHidden) {
		args.push("--hidden", "--no-ignore");
	}

	for (const pattern of DEFAULT_IGNORE_PATTERNS) {
		args.push("--glob", `!${pattern}`);
	}

	for (const pattern of parseGlobPatterns(includePattern)) {
		args.push("--glob", normalizePathForGlob(pattern));
	}

	for (const pattern of parseGlobPatterns(excludePattern)) {
		args.push("--glob", `!${normalizePathForGlob(pattern)}`);
	}

	args.push(query, ".");

	try {
		const { stdout } = await runRipgrep(args, {
			cwd: normalizeAbsolutePath(rootPath),
			maxBuffer: KEYWORD_SEARCH_RIPGREP_BUFFER_BYTES,
		});
		const matches: InternalContentMatch[] = [];
		const seen = new Set<string>();
		const lines = stdout.split(/\r?\n/);

		for (const rawLine of lines) {
			if (!rawLine || matches.length >= maxCandidates) {
				continue;
			}

			let parsed: unknown;
			try {
				parsed = JSON.parse(rawLine);
			} catch {
				continue;
			}

			if (
				typeof parsed !== "object" ||
				parsed === null ||
				!("type" in parsed) ||
				parsed.type !== "match" ||
				!("data" in parsed)
			) {
				continue;
			}

			const data = parsed.data;
			if (typeof data !== "object" || data === null) {
				continue;
			}

			const pathData = "path" in data ? data.path : null;
			const relativePath =
				typeof pathData === "object" &&
				pathData !== null &&
				"text" in pathData &&
				typeof pathData.text === "string"
					? pathData.text
					: null;

			if (!relativePath) {
				continue;
			}

			const lineNumber =
				"line_number" in data && typeof data.line_number === "number"
					? data.line_number
					: 1;

			const linesData = "lines" in data ? data.lines : null;
			const lineText =
				typeof linesData === "object" &&
				linesData !== null &&
				"text" in linesData &&
				typeof linesData.text === "string"
					? linesData.text
					: "";

			const submatches = "submatches" in data ? data.submatches : null;
			let column = 1;
			if (Array.isArray(submatches) && submatches.length > 0) {
				const firstSubmatch = submatches[0];
				if (
					typeof firstSubmatch === "object" &&
					firstSubmatch !== null &&
					"start" in firstSubmatch &&
					typeof firstSubmatch.start === "number"
				) {
					column = firstSubmatch.start + 1;
				}
			}

			const absolutePath = path.join(
				normalizeAbsolutePath(rootPath),
				relativePath,
			);
			const id = `${absolutePath}:${lineNumber}:${column}`;
			if (seen.has(id)) {
				continue;
			}
			seen.add(id);

			matches.push({
				absolutePath,
				relativePath,
				name: path.basename(relativePath),
				line: lineNumber,
				column,
				preview: formatPreviewLine(lineText.replace(/\r?\n$/, "")),
			});
		}

		return rankContentMatches(matches, query, safeLimit);
	} catch (error) {
		const err = error as NodeJS.ErrnoException & {
			code?: string | number | null;
		};
		const exitCode =
			typeof err.code === "number"
				? err.code
				: typeof err.code === "string" && /^\d+$/.test(err.code)
					? Number.parseInt(err.code, 10)
					: null;
		if (exitCode === 1) {
			return [];
		}
		throw error;
	}
}

async function searchContentWithScan({
	index,
	query,
	pathMatcher,
	limit,
}: {
	index: FileSearchIndex;
	query: string;
	pathMatcher: PathFilterMatcher;
	limit: number;
}): Promise<InternalContentMatch[]> {
	const safeLimit = safeSearchLimit(limit);
	const maxCandidates = safeLimit * KEYWORD_SEARCH_CANDIDATE_MULTIPLIER;
	const lowerNeedle = query.toLowerCase();
	const matches: InternalContentMatch[] = [];

	for (const item of index.items) {
		if (matches.length >= maxCandidates) {
			break;
		}
		if (!matchesPathFilters(item.relativePath, pathMatcher)) {
			continue;
		}

		try {
			const stats = await fs.stat(item.absolutePath);
			if (
				!stats.isFile() ||
				stats.size === 0 ||
				stats.size > MAX_KEYWORD_FILE_SIZE_BYTES
			) {
				continue;
			}

			const buffer = await fs.readFile(item.absolutePath);
			if (isBinaryContent(buffer)) {
				continue;
			}

			const lines = buffer.toString("utf8").split(/\r?\n/);
			for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
				if (matches.length >= maxCandidates) {
					break;
				}

				const line = lines[lineIndex] ?? "";
				const lowerLine = line.toLowerCase();
				let fromIndex = 0;

				while (matches.length < maxCandidates) {
					const matchIndex = lowerLine.indexOf(lowerNeedle, fromIndex);
					if (matchIndex === -1) {
						break;
					}

					matches.push({
						absolutePath: item.absolutePath,
						relativePath: item.relativePath,
						name: item.name,
						line: lineIndex + 1,
						column: matchIndex + 1,
						preview: formatPreviewLine(line),
					});

					fromIndex = matchIndex + lowerNeedle.length;
				}
			}
		} catch {}
	}

	return rankContentMatches(matches, query, safeLimit);
}

function isHiddenRelativePath(relativePath: string): boolean {
	return normalizePathForGlob(relativePath)
		.split("/")
		.some((segment) => segment.startsWith(".") && segment.length > 1);
}

function shouldIndexRelativePath(
	relativePath: string,
	includeHidden: boolean,
): boolean {
	const normalizedPath = normalizePathForGlob(relativePath);
	if (!includeHidden && isHiddenRelativePath(normalizedPath)) {
		return false;
	}

	return !defaultIgnoreMatchers.some((matcher) => matcher.test(normalizedPath));
}

function applySearchPatchEvent({
	itemsByPath,
	rootPath,
	includeHidden,
	event,
}: {
	itemsByPath: Map<string, SearchIndexEntry>;
	rootPath: string;
	includeHidden: boolean;
	event: SearchPatchEvent;
}): void {
	if (event.kind === "rename" && event.oldAbsolutePath) {
		itemsByPath.delete(normalizeAbsolutePath(event.oldAbsolutePath));
		const nextRelativePath = toRelativePath(rootPath, event.absolutePath);
		if (
			event.isDirectory ||
			!shouldIndexRelativePath(nextRelativePath, includeHidden)
		) {
			return;
		}

		const nextAbsolutePath = normalizeAbsolutePath(event.absolutePath);
		itemsByPath.set(nextAbsolutePath, {
			absolutePath: nextAbsolutePath,
			relativePath: nextRelativePath,
			name: path.basename(nextAbsolutePath),
		});
		return;
	}

	const absolutePath = normalizeAbsolutePath(event.absolutePath);
	const relativePath = toRelativePath(rootPath, absolutePath);
	const shouldRemove =
		event.kind === "delete" ||
		event.isDirectory ||
		!shouldIndexRelativePath(relativePath, includeHidden);

	if (shouldRemove) {
		itemsByPath.delete(absolutePath);
		return;
	}

	itemsByPath.set(absolutePath, {
		absolutePath,
		relativePath,
		name: path.basename(absolutePath),
	});
}

export function invalidateSearchIndex(options: SearchIndexKeyOptions): void {
	const cacheKey = getSearchCacheKey(options);
	advanceSearchIndexVersion(cacheKey);
	searchIndexCache.delete(cacheKey);
	searchIndexBuilds.delete(cacheKey);
}

export function invalidateSearchIndexesForRoot(rootPath: string): void {
	for (const includeHidden of [true, false]) {
		invalidateSearchIndex({ rootPath, includeHidden });
	}
}

export function invalidateAllSearchIndexes(): void {
	for (const cacheKey of new Set([
		...searchIndexCache.keys(),
		...searchIndexBuilds.keys(),
		...searchIndexVersions.keys(),
	])) {
		advanceSearchIndexVersion(cacheKey);
	}
	searchIndexCache.clear();
	searchIndexBuilds.clear();
}

export function patchSearchIndexesForRoot(
	rootPath: string,
	events: SearchPatchEvent[],
): void {
	if (events.length === 0) {
		return;
	}

	const normalizedRootPath = normalizeAbsolutePath(rootPath);

	for (const includeHidden of [true, false]) {
		const cacheKey = getSearchCacheKey({
			rootPath: normalizedRootPath,
			includeHidden,
		});
		const cached = searchIndexCache.get(cacheKey);
		const hasInFlightBuild = searchIndexBuilds.has(cacheKey);
		if (!cached && !hasInFlightBuild) {
			continue;
		}

		advanceSearchIndexVersion(cacheKey);
		searchIndexBuilds.delete(cacheKey);

		if (!cached) {
			continue;
		}

		const nextItemsByPath = new Map(
			cached.index.items.map((item) => [item.absolutePath, item]),
		);
		for (const event of events) {
			applySearchPatchEvent({
				itemsByPath: nextItemsByPath,
				rootPath: normalizedRootPath,
				includeHidden,
				event,
			});
		}
		const nextItems = Array.from(nextItemsByPath.values());

		searchIndexCache.set(cacheKey, {
			index: {
				items: nextItems,
				fuse: createFileSearchFuse(nextItems),
			},
			builtAt: Date.now(),
		});
	}
}

export async function searchFiles({
	rootPath,
	query,
	includeHidden = false,
	includePattern = "",
	excludePattern = "",
	limit = 20,
}: SearchFilesOptions): Promise<FsSearchMatch[]> {
	const trimmedQuery = query.trim();
	if (!trimmedQuery) {
		return [];
	}

	const index = await getSearchIndex({
		rootPath,
		includeHidden,
	});
	const pathMatcher = createPathFilterMatcher({
		includePattern,
		excludePattern,
	});
	const searchableItems = pathMatcher.hasFilters
		? index.items.filter((item) =>
				matchesPathFilters(item.relativePath, pathMatcher),
			)
		: index.items;

	if (searchableItems.length === 0) {
		return [];
	}

	const fuse = pathMatcher.hasFilters
		? createFileSearchFuse(searchableItems)
		: index.fuse;
	const results = fuse.search(trimmedQuery, {
		limit: safeSearchLimit(limit),
	});

	return results.map((result) => ({
		absolutePath: result.item.absolutePath,
		relativePath: result.item.relativePath,
		name: result.item.name,
		kind: "file" as const,
		score: 1 - (result.score ?? 0),
	}));
}

export async function searchContent({
	rootPath,
	query,
	includeHidden = true,
	includePattern = "",
	excludePattern = "",
	limit = 20,
	runRipgrep = defaultRunRipgrep,
}: SearchContentOptions): Promise<FsContentMatch[]> {
	const trimmedQuery = query.trim();
	if (!trimmedQuery) {
		return [];
	}

	const index = await getSearchIndex({
		rootPath,
		includeHidden,
	});
	const pathMatcher = createPathFilterMatcher({
		includePattern,
		excludePattern,
	});

	let internalMatches: InternalContentMatch[];
	try {
		internalMatches = await searchContentWithRipgrep({
			rootPath,
			query: trimmedQuery,
			includeHidden,
			includePattern,
			excludePattern,
			limit,
			runRipgrep,
		});
	} catch {
		internalMatches = await searchContentWithScan({
			index,
			query: trimmedQuery,
			pathMatcher,
			limit,
		});
	}

	return internalMatches.map(
		({ absolutePath, relativePath, line, column, preview }) => ({
			absolutePath,
			relativePath,
			line,
			column,
			preview,
		}),
	);
}
