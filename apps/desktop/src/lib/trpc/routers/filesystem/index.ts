import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { shell } from "electron";
import fg from "fast-glob";
import Fuse from "fuse.js";
import type { DirectoryEntry } from "shared/file-tree-types";
import { z } from "zod";
import { publicProcedure, router } from "../..";

const SEARCH_INDEX_TTL_MS = 30_000;
const MAX_SEARCH_RESULTS = 500;
const MAX_KEYWORD_FILE_SIZE_BYTES = 1024 * 1024;
const BINARY_CHECK_SIZE = 8192;
const MAX_PREVIEW_LENGTH = 160;
const KEYWORD_SEARCH_CANDIDATE_MULTIPLIER = 4;
const KEYWORD_SEARCH_MAX_COUNT_PER_FILE = 3;
const KEYWORD_SEARCH_RIPGREP_BUFFER_BYTES = 10 * 1024 * 1024;
const DEFAULT_IGNORE_PATTERNS = [
	"**/node_modules/**",
	"**/.git/**",
	"**/dist/**",
	"**/build/**",
	"**/.next/**",
	"**/.turbo/**",
	"**/coverage/**",
];
const FILE_SEARCH_FUSE_OPTIONS = {
	keys: [
		{ name: "name", weight: 2 },
		{ name: "relativePath", weight: 1 },
	],
	threshold: 0.4,
	includeScore: true,
	ignoreLocation: true,
};

interface FileSearchItem {
	id: string;
	name: string;
	relativePath: string;
	path: string;
	isDirectory: boolean;
}

interface FileSearchIndex {
	items: FileSearchItem[];
	fuse: Fuse<FileSearchItem>;
}

interface FileSearchCacheEntry {
	index: FileSearchIndex;
	builtAt: number;
}

interface KeywordSearchMatch {
	id: string;
	name: string;
	relativePath: string;
	path: string;
	line: number;
	column: number;
	preview: string;
}

const searchIndexCache = new Map<string, FileSearchCacheEntry>();
const searchIndexBuilds = new Map<string, Promise<FileSearchIndex>>();
const execFileAsync = promisify(execFile);

function createFileSearchFuse(items: FileSearchItem[]): Fuse<FileSearchItem> {
	return new Fuse(items, FILE_SEARCH_FUSE_OPTIONS);
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

interface PathFilterMatcher {
	includeMatchers: RegExp[];
	excludeMatchers: RegExp[];
	hasFilters: boolean;
}

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

	const fuse = createFileSearchFuse(items);

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

function isBinaryContent(buffer: Buffer): boolean {
	const checkLength = Math.min(buffer.length, BINARY_CHECK_SIZE);
	for (let i = 0; i < checkLength; i++) {
		if (buffer[i] === 0) {
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

function rankKeywordMatches(
	matches: KeywordSearchMatch[],
	query: string,
	limit: number,
): KeywordSearchMatch[] {
	if (matches.length === 0) {
		return [];
	}

	const safeLimit = Math.max(1, Math.min(limit, MAX_SEARCH_RESULTS));
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

interface SearchKeywordWithRipgrepOptions {
	rootPath: string;
	query: string;
	includeHidden: boolean;
	includePattern: string;
	excludePattern: string;
	limit: number;
}

async function searchKeywordWithRipgrep({
	rootPath,
	query,
	includeHidden,
	includePattern,
	excludePattern,
	limit,
}: SearchKeywordWithRipgrepOptions): Promise<KeywordSearchMatch[]> {
	const safeLimit = Math.max(1, Math.min(limit, MAX_SEARCH_RESULTS));
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
		args.push("--hidden");
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
		const { stdout } = await execFileAsync("rg", args, {
			cwd: rootPath,
			windowsHide: true,
			maxBuffer: KEYWORD_SEARCH_RIPGREP_BUFFER_BYTES,
		});

		const matches: KeywordSearchMatch[] = [];
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

			const lineNumberValue =
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

			const id = `${relativePath}:${lineNumberValue}:${column}`;
			if (seen.has(id)) {
				continue;
			}
			seen.add(id);

			matches.push({
				id,
				name: path.basename(relativePath),
				relativePath,
				path: path.join(rootPath, relativePath),
				line: lineNumberValue,
				column,
				preview: formatPreviewLine(lineText.replace(/\r?\n$/, "")),
			});
		}

		return rankKeywordMatches(matches, query, safeLimit);
	} catch (error) {
		const err = error as NodeJS.ErrnoException & { code?: string | null };
		const exitCode =
			typeof err.code === "number"
				? err.code
				: typeof err.code === "string" && /^\d+$/.test(err.code)
					? Number.parseInt(err.code, 10)
					: null;
		// ripgrep exits with code 1 when there are simply no matches.
		if (exitCode === 1) {
			return [];
		}
		throw error;
	}
}

interface SearchKeywordWithScanOptions {
	index: FileSearchIndex;
	query: string;
	pathMatcher: PathFilterMatcher;
	limit: number;
}

async function searchKeywordWithScan({
	index,
	query,
	pathMatcher,
	limit,
}: SearchKeywordWithScanOptions): Promise<KeywordSearchMatch[]> {
	const safeLimit = Math.max(1, Math.min(limit, MAX_SEARCH_RESULTS));
	const maxCandidates = safeLimit * KEYWORD_SEARCH_CANDIDATE_MULTIPLIER;
	const lowerNeedle = query.toLowerCase();
	const matches: KeywordSearchMatch[] = [];

	for (const item of index.items) {
		if (matches.length >= maxCandidates) {
			break;
		}
		if (!matchesPathFilters(item.relativePath, pathMatcher)) {
			continue;
		}

		try {
			const stats = await fs.stat(item.path);
			if (
				!stats.isFile() ||
				stats.size === 0 ||
				stats.size > MAX_KEYWORD_FILE_SIZE_BYTES
			) {
				continue;
			}

			const buffer = await fs.readFile(item.path);
			if (isBinaryContent(buffer)) {
				continue;
			}

			const lines = buffer.toString("utf-8").split(/\r?\n/);
			for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
				if (matches.length >= maxCandidates) {
					break;
				}

				const line = lines[lineIndex];
				const lowerLine = line.toLowerCase();
				let fromIndex = 0;

				while (matches.length < maxCandidates) {
					const matchIndex = lowerLine.indexOf(lowerNeedle, fromIndex);
					if (matchIndex === -1) {
						break;
					}

					matches.push({
						id: `${item.relativePath}:${lineIndex + 1}:${matchIndex + 1}`,
						name: item.name,
						relativePath: item.relativePath,
						path: item.path,
						line: lineIndex + 1,
						column: matchIndex + 1,
						preview: formatPreviewLine(line),
					});

					fromIndex = matchIndex + lowerNeedle.length;
				}
			}
		} catch {
			// Skip unreadable files and continue searching.
		}
	}

	return rankKeywordMatches(matches, query, safeLimit);
}

export const createFilesystemRouter = () => {
	return router({
		readDirectory: publicProcedure
			.input(
				z.object({
					dirPath: z.string(),
					rootPath: z.string(),
					includeHidden: z.boolean().default(false),
				}),
			)
			.query(async ({ input }): Promise<DirectoryEntry[]> => {
				const { dirPath, rootPath, includeHidden } = input;

				try {
					const entries = await fs.readdir(dirPath, { withFileTypes: true });

					return entries
						.filter((entry) => includeHidden || !entry.name.startsWith("."))
						.map((entry) => {
							const fullPath = path.join(dirPath, entry.name);
							const relativePath = path.relative(rootPath, fullPath);
							return {
								id: relativePath,
								name: entry.name,
								path: fullPath,
								relativePath,
								isDirectory: entry.isDirectory(),
							};
						})
						.sort((a, b) => {
							if (a.isDirectory !== b.isDirectory) {
								return a.isDirectory ? -1 : 1;
							}
							return a.name.localeCompare(b.name);
						});
				} catch (error) {
					console.error("[filesystem/readDirectory] Failed:", {
						dirPath,
						error,
					});
					return [];
				}
			}),

		searchFiles: publicProcedure
			.input(
				z.object({
					rootPath: z.string(),
					query: z.string(),
					includePattern: z.string().default(""),
					excludePattern: z.string().default(""),
					includeHidden: z.boolean().default(false),
					limit: z.number().default(200),
				}),
			)
			.query(async ({ input }) => {
				const {
					rootPath,
					query,
					includePattern,
					excludePattern,
					includeHidden,
					limit,
				} = input;
				const trimmedQuery = query.trim();

				if (!trimmedQuery) {
					return [];
				}

				try {
					const index = await getSearchIndex({ rootPath, includeHidden });
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

					const safeLimit = Math.max(1, Math.min(limit, MAX_SEARCH_RESULTS));
					const fuse = pathMatcher.hasFilters
						? createFileSearchFuse(searchableItems)
						: index.fuse;
					const results = fuse.search(trimmedQuery, {
						limit: safeLimit,
					});

					return results.map((result) => ({
						id: result.item.id,
						name: result.item.name,
						relativePath: result.item.relativePath,
						path: result.item.path,
						isDirectory: false,
						score: 1 - (result.score ?? 0),
					}));
				} catch (error) {
					console.error("[filesystem/searchFiles] Failed:", {
						rootPath,
						query,
						error,
					});
					return [];
				}
			}),

		searchKeyword: publicProcedure
			.input(
				z.object({
					rootPath: z.string(),
					query: z.string(),
					includePattern: z.string().default(""),
					excludePattern: z.string().default(""),
					includeHidden: z.boolean().default(false),
					limit: z.number().default(200),
				}),
			)
			.query(async ({ input }): Promise<KeywordSearchMatch[]> => {
				const {
					rootPath,
					query,
					includePattern,
					excludePattern,
					includeHidden,
					limit,
				} = input;
				const trimmedQuery = query.trim();

				if (!trimmedQuery) {
					return [];
				}

				try {
					const index = await getSearchIndex({ rootPath, includeHidden });
					const pathMatcher = createPathFilterMatcher({
						includePattern,
						excludePattern,
					});
					try {
						return await searchKeywordWithRipgrep({
							rootPath,
							query: trimmedQuery,
							includeHidden,
							includePattern,
							excludePattern,
							limit,
						});
					} catch {
						return await searchKeywordWithScan({
							index,
							query: trimmedQuery,
							pathMatcher,
							limit,
						});
					}
				} catch (error) {
					console.error("[filesystem/searchKeyword] Failed:", {
						rootPath,
						query,
						error,
					});
					return [];
				}
			}),

		createFile: publicProcedure
			.input(
				z.object({
					dirPath: z.string(),
					fileName: z.string(),
					content: z.string().default(""),
				}),
			)
			.mutation(async ({ input }) => {
				const filePath = path.join(input.dirPath, input.fileName);

				try {
					await fs.access(filePath);
					throw new Error(`File already exists: ${input.fileName}`);
				} catch (error) {
					if (
						error instanceof Error &&
						error.message.includes("already exists")
					) {
						throw error;
					}
				}

				await fs.writeFile(filePath, input.content, "utf-8");
				return { path: filePath };
			}),

		createDirectory: publicProcedure
			.input(
				z.object({
					parentPath: z.string(),
					dirName: z.string(),
				}),
			)
			.mutation(async ({ input }) => {
				const dirPath = path.join(input.parentPath, input.dirName);

				try {
					await fs.access(dirPath);
					throw new Error(`Directory already exists: ${input.dirName}`);
				} catch (error) {
					if (
						error instanceof Error &&
						error.message.includes("already exists")
					) {
						throw error;
					}
				}

				await fs.mkdir(dirPath, { recursive: true });
				return { path: dirPath };
			}),

		rename: publicProcedure
			.input(
				z.object({
					oldPath: z.string(),
					newName: z.string(),
				}),
			)
			.mutation(async ({ input }) => {
				const newPath = path.join(path.dirname(input.oldPath), input.newName);

				try {
					await fs.access(newPath);
					throw new Error(`Target already exists: ${input.newName}`);
				} catch (error) {
					if (
						error instanceof Error &&
						error.message.includes("already exists")
					) {
						throw error;
					}
				}

				await fs.rename(input.oldPath, newPath);
				return { oldPath: input.oldPath, newPath };
			}),

		delete: publicProcedure
			.input(
				z.object({
					paths: z.array(z.string()),
					permanent: z.boolean().default(false),
				}),
			)
			.mutation(async ({ input }) => {
				const deleted: string[] = [];
				const errors: { path: string; error: string }[] = [];

				for (const filePath of input.paths) {
					try {
						if (input.permanent) {
							await fs.rm(filePath, { recursive: true, force: true });
						} else {
							await shell.trashItem(filePath);
						}
						deleted.push(filePath);
					} catch (error) {
						errors.push({
							path: filePath,
							error: error instanceof Error ? error.message : String(error),
						});
					}
				}

				return { deleted, errors };
			}),

		move: publicProcedure
			.input(
				z.object({
					sourcePaths: z.array(z.string()),
					destinationDir: z.string(),
				}),
			)
			.mutation(async ({ input }) => {
				const moved: { from: string; to: string }[] = [];
				const errors: { path: string; error: string }[] = [];

				for (const sourcePath of input.sourcePaths) {
					try {
						const fileName = path.basename(sourcePath);
						const destPath = path.join(input.destinationDir, fileName);

						try {
							await fs.access(destPath);
							throw new Error(`Target already exists: ${fileName}`);
						} catch (accessError) {
							if (
								accessError instanceof Error &&
								accessError.message.includes("already exists")
							) {
								throw accessError;
							}
						}

						await fs.rename(sourcePath, destPath);
						moved.push({ from: sourcePath, to: destPath });
					} catch (error) {
						errors.push({
							path: sourcePath,
							error: error instanceof Error ? error.message : String(error),
						});
					}
				}

				return { moved, errors };
			}),

		copy: publicProcedure
			.input(
				z.object({
					sourcePaths: z.array(z.string()),
					destinationDir: z.string(),
				}),
			)
			.mutation(async ({ input }) => {
				const copied: { from: string; to: string }[] = [];
				const errors: { path: string; error: string }[] = [];

				for (const sourcePath of input.sourcePaths) {
					try {
						const fileName = path.basename(sourcePath);
						let destPath = path.join(input.destinationDir, fileName);

						let counter = 1;
						while (true) {
							try {
								await fs.access(destPath);
								const ext = path.extname(fileName);
								const base = path.basename(fileName, ext);
								destPath = path.join(
									input.destinationDir,
									`${base} (${counter})${ext}`,
								);
								counter++;
							} catch {
								break;
							}
						}

						await fs.cp(sourcePath, destPath, { recursive: true });
						copied.push({ from: sourcePath, to: destPath });
					} catch (error) {
						errors.push({
							path: sourcePath,
							error: error instanceof Error ? error.message : String(error),
						});
					}
				}

				return { copied, errors };
			}),

		exists: publicProcedure
			.input(z.object({ path: z.string() }))
			.query(async ({ input }) => {
				try {
					await fs.access(input.path);
					const stats = await fs.stat(input.path);
					return {
						exists: true,
						isDirectory: stats.isDirectory(),
						isFile: stats.isFile(),
					};
				} catch {
					return { exists: false, isDirectory: false, isFile: false };
				}
			}),

		stat: publicProcedure
			.input(z.object({ path: z.string() }))
			.query(async ({ input }) => {
				try {
					const stats = await fs.stat(input.path);
					return {
						size: stats.size,
						isDirectory: stats.isDirectory(),
						isFile: stats.isFile(),
						isSymbolicLink: stats.isSymbolicLink(),
						createdAt: stats.birthtime.toISOString(),
						modifiedAt: stats.mtime.toISOString(),
						accessedAt: stats.atime.toISOString(),
					};
				} catch (error) {
					console.error("[filesystem/stat] Failed:", {
						path: input.path,
						error,
					});
					return null;
				}
			}),
	});
};
