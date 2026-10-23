/*---------------------------------------------------------------------------------------------
 *  Adapted from VSCode's terminalLocalLinkDetector.ts
 *  https://github.com/microsoft/vscode/blob/main/src/vs/workbench/contrib/terminalContrib/links/browser/terminalLocalLinkDetector.ts
 *
 *  Detects local file-path links in terminal text, validating each candidate
 *  path against the filesystem before returning it as a link.
 *--------------------------------------------------------------------------------------------*/

import {
	detectFallbackLinks,
	detectLinks,
	generateTrimmedCandidates,
	getCurrentOS,
	getLinkSuffix,
	type IParsedLink,
	removeLinkSuffix,
} from "@superset/shared/terminal-link-parsing";
import type { TerminalLinkResolver } from "./link-resolver";

const MAX_LINE_LENGTH = 2000;
const MAX_RESOLVED_LINKS_IN_LINE = 10;
const MAX_RESOLVED_LINK_LENGTH = 1024;

// Limits for the pass that finds paths containing spaces. Every candidate is a
// stat call to the host, so a long line must not fan out into many requests.
const MAX_SPACED_PATH_STARTS = 6;
const MAX_SPACED_PATH_WORDS = 8;
const MAX_SPACED_PATH_STAT_CALLS = 40;

// Where a path containing spaces may start: an absolute, home, relative or
// file:// path that follows whitespace, a quote or an opening bracket. A `/`
// inside a word or after `:` (as in a URL) is not a start.
const SPACED_PATH_START = /(?<=^|[\s"'`([<=])(?:file:\/\/|~\/|\.{1,2}\/|\/)/g;

/** Whether a single space and another word follow the link on the same line. */
function isFollowedByWord(text: string, link: DetectedLink): boolean {
	return /^ \S/.test(text.slice(link.endIndex, link.endIndex + 2));
}

/**
 * A detected and validated local file link.
 */
export interface DetectedLink {
	/** The full matched text in the terminal line (including suffix). */
	text: string;
	/** The start column in the line (0-based). */
	startIndex: number;
	/** The end column in the line (0-based, exclusive). */
	endIndex: number;
	/** The validated absolute path on disk. */
	resolvedPath: string;
	/** Whether the path is a directory. */
	isDirectory: boolean;
	/** Line number from the suffix, if any. */
	row: number | undefined;
	/** Column number from the suffix, if any. */
	col: number | undefined;
	/** End line number from the suffix, if any. */
	rowEnd: number | undefined;
	/** End column number from the suffix, if any. */
	colEnd: number | undefined;
	/** The original parsed link data (for debugging). */
	parsedLink?: IParsedLink;
}

/**
 * Detects local file-system links in a line of terminal text.
 *
 * The flow:
 * 1. Parse the line with `detectLinks()` (vendored from VSCode)
 * 2. For each parsed link, build candidate paths (raw, trimmed variants)
 * 3. Validate each candidate via the resolver (which delegates to the host)
 * 4. Only return links that point to real files/directories
 * 5. If no primary links found, try fallback matchers (Python, Rust, C++, etc.)
 *
 * All path resolution (relative → workspace root, ~ → $HOME) happens on the
 * host service, not in the renderer.
 */
export class LocalLinkDetector {
	constructor(private readonly _resolver: TerminalLinkResolver) {}

	async detect(text: string): Promise<DetectedLink[]> {
		if (!text || text.length > MAX_LINE_LENGTH) {
			return [];
		}

		const links: DetectedLink[] = [];
		// Links from the primary pass. A longer path that contains spaces may
		// replace them; fallback matches carry line info and are never replaced.
		const primaryLinks = new Set<DetectedLink>();
		let hasUnresolvedPiece = false;
		let resolvedCount = 0;

		const os = getCurrentOS();
		const parsedLinks = detectLinks(text, os);

		for (const parsedLink of parsedLinks) {
			if (parsedLink.path.text.length > MAX_RESOLVED_LINK_LENGTH) {
				continue;
			}

			// Skip URLs — they're handled by the URL link provider
			if (this._isUrl(parsedLink.path.text)) {
				continue;
			}

			// Build candidate paths to try
			const candidates = this._buildCandidates(parsedLink.path.text);

			// Also generate trimmed candidates (strip trailing punctuation)
			const trimmedCandidates: string[] = [];
			for (const candidate of candidates) {
				for (const trimmed of generateTrimmedCandidates(candidate)) {
					trimmedCandidates.push(trimmed.path);
				}
			}
			const allCandidates = [...candidates, ...trimmedCandidates];

			const resolved =
				await this._resolver.resolveMultipleCandidates(allCandidates);

			if (!resolved) {
				hasUnresolvedPiece = true;
			} else {
				const linkStart = parsedLink.prefix?.index ?? parsedLink.path.index;
				const linkEnd = parsedLink.suffix
					? parsedLink.suffix.suffix.index +
						parsedLink.suffix.suffix.text.length
					: parsedLink.path.index + parsedLink.path.text.length;

				const link: DetectedLink = {
					text: text.substring(linkStart, linkEnd),
					startIndex: linkStart,
					endIndex: linkEnd,
					resolvedPath: resolved.path,
					isDirectory: resolved.isDirectory,
					row: parsedLink.suffix?.row,
					col: parsedLink.suffix?.col,
					rowEnd: parsedLink.suffix?.rowEnd,
					colEnd: parsedLink.suffix?.colEnd,
					parsedLink,
				};
				links.push(link);
				primaryLinks.add(link);
			}

			if (++resolvedCount >= MAX_RESOLVED_LINKS_IN_LINE) {
				break;
			}
		}

		// If no primary links found, try fallback matchers
		if (links.length === 0) {
			const fallbacks = detectFallbackLinks(text);
			for (const fallback of fallbacks) {
				if (fallback.link.length > MAX_RESOLVED_LINK_LENGTH) {
					continue;
				}

				const resolved = await this._resolver.resolveLink(fallback.path);
				if (resolved) {
					links.push({
						text: fallback.link,
						startIndex: fallback.index,
						endIndex: fallback.index + fallback.link.length,
						resolvedPath: resolved.path,
						isDirectory: resolved.isDirectory,
						row: fallback.line,
						col: fallback.col,
						rowEnd: undefined,
						colEnd: undefined,
					});
				}
			}
		}

		// SUPERSET ADDITION: paths that contain spaces. The shared parser ends a
		// path at whitespace, so `/tmp/link test/example.md` is split into pieces
		// that don't exist. Worth trying when a piece failed to resolve, when
		// nothing was found, or when a resolved link is followed by another word,
		// since `/tmp/my file` parses as `/tmp/my` alone and that may exist too.
		if (
			hasUnresolvedPiece ||
			links.length === 0 ||
			links.some(
				(link) => primaryLinks.has(link) && isFollowedByWord(text, link),
			)
		) {
			await this._detectPathsWithSpaces(text, links, primaryLinks);
		}

		// SUPERSET ADDITION (not in VSCode's shared fallback matchers):
		// Last resort — treat the whole trimmed line as a path candidate.
		// Safe because we validate via stat (false positives are filtered out).
		// Matches VSCode's `/^ *(?<link>(?<path>.+))/` whole-line fallback in
		// terminalLocalLinkDetector.ts. Kept here (not in shared fallback
		// matchers) because unvalidated consumers like v1 FilePathLinkProvider
		// would get false positives from URLs, version strings, etc.
		//
		// To disable: remove or comment out this block. The word link detector
		// (WordLinkDetector) provides similar coverage for bare filenames.
		if (links.length === 0 && text.trim().length <= MAX_RESOLVED_LINK_LENGTH) {
			const trimmed = text.trim();
			const resolved = await this._resolver.resolveLink(trimmed);
			if (resolved) {
				const startIndex = text.indexOf(trimmed);
				links.push({
					text: trimmed,
					startIndex,
					endIndex: startIndex + trimmed.length,
					resolvedPath: resolved.path,
					isDirectory: resolved.isDirectory,
					row: undefined,
					col: undefined,
					rowEnd: undefined,
					colEnd: undefined,
				});
			}
		}

		return links;
	}

	/**
	 * Finds paths that contain spaces by joining words across whitespace and
	 * checking each candidate against the filesystem, longest first.
	 *
	 * Kept in the desktop detector rather than the shared parser because it
	 * relies on stat validation: unvalidated consumers would link arbitrary
	 * text that happens to follow a `/`.
	 */
	private async _detectPathsWithSpaces(
		text: string,
		links: DetectedLink[],
		replaceable: Set<DetectedLink>,
	): Promise<void> {
		const budget = { statCalls: MAX_SPACED_PATH_STAT_CALLS };
		let starts = 0;

		for (const match of text.matchAll(SPACED_PATH_START)) {
			const start = match.index;
			const covering = links.find(
				(link) => start >= link.startIndex && start < link.endIndex,
			);
			// Skip starts inside a link, except where a primary link begins: a
			// longer path with a space may start at the same place.
			if (
				covering &&
				!(replaceable.has(covering) && covering.startIndex === start)
			) {
				continue;
			}
			if (++starts > MAX_SPACED_PATH_STARTS || budget.statCalls <= 0) {
				break;
			}

			const found = await this._resolveSpacedPathAt(text, start, budget);
			if (!found) {
				continue;
			}

			const end = start + found.text.length;
			// A validated longer path wins over primary pieces inside it.
			for (let i = links.length - 1; i >= 0; i--) {
				const link = links[i];
				if (
					link &&
					replaceable.has(link) &&
					link.startIndex >= start &&
					link.endIndex <= end
				) {
					links.splice(i, 1);
				}
			}

			const suffix = getLinkSuffix(found.text);
			links.push({
				text: found.text,
				startIndex: start,
				endIndex: end,
				resolvedPath: found.resolvedPath,
				isDirectory: found.isDirectory,
				row: suffix?.row,
				col: suffix?.col,
				rowEnd: suffix?.rowEnd,
				colEnd: suffix?.colEnd,
			});
			links.sort((a, b) => a.startIndex - b.startIndex);

			if (links.length >= MAX_RESOLVED_LINKS_IN_LINE) {
				break;
			}
		}
	}

	private async _resolveSpacedPathAt(
		text: string,
		start: number,
		budget: { statCalls: number },
	): Promise<{
		text: string;
		resolvedPath: string;
		isDirectory: boolean;
	} | null> {
		for (const candidate of this._spacedPathCandidates(text, start)) {
			const variants = [
				candidate,
				...generateTrimmedCandidates(candidate).map((trimmed) => trimmed.path),
			];
			for (const variant of variants) {
				if (budget.statCalls <= 0) {
					return null;
				}
				budget.statCalls--;
				const resolved = await this._resolver.resolveLink(variant);
				if (resolved) {
					return {
						text: variant,
						resolvedPath: resolved.path,
						isDirectory: resolved.isDirectory,
					};
				}
			}
		}
		return null;
	}

	/**
	 * Candidate path texts starting at `start`, longest first. Each one ends at
	 * a whitespace boundary and contains at least one space, since paths
	 * without spaces are already handled by the primary pass.
	 */
	private _spacedPathCandidates(text: string, start: number): string[] {
		const rest = text.slice(start, start + MAX_RESOLVED_LINK_LENGTH);
		const candidates: string[] = [];

		// A quote before the path is a clear boundary: try the quoted text first.
		const quote = text[start - 1];
		if (quote === '"' || quote === "'" || quote === "`") {
			const close = rest.indexOf(quote);
			if (close > 0 && /\s/.test(rest.slice(0, close))) {
				candidates.push(rest.slice(0, close));
			}
		}

		const ends = new Set<number>();
		for (const whitespace of rest.matchAll(/\s+/g)) {
			if (ends.size >= MAX_SPACED_PATH_WORDS) {
				break;
			}
			ends.add(whitespace.index);
		}
		if (ends.size < MAX_SPACED_PATH_WORDS) {
			ends.add(rest.trimEnd().length);
		}

		for (const end of [...ends].sort((a, b) => b - a)) {
			const candidate = rest.slice(0, end);
			if (/\s/.test(candidate) && !candidates.includes(candidate)) {
				candidates.push(candidate);
			}
		}
		return candidates;
	}

	private _isUrl(text: string): boolean {
		return (
			text.startsWith("http://") ||
			text.startsWith("https://") ||
			text.startsWith("ftp://")
		);
	}

	/**
	 * Build candidate paths from the raw link text.
	 * The raw path is sent to the host for resolution — we only strip
	 * the line/column suffix here.
	 */
	private _buildCandidates(pathText: string): string[] {
		const candidates: string[] = [];

		const cleanPath = removeLinkSuffix(pathText);
		if (!cleanPath) {
			return candidates;
		}

		candidates.push(cleanPath);

		// For relative paths with leading ../, also try without the ../ prefix
		const parentPrefixMatch = cleanPath.match(/^(\.\.[/\\])+/);
		if (parentPrefixMatch) {
			candidates.push(cleanPath.replace(/^(\.\.[/\\])+/, ""));
		}

		return candidates;
	}
}
