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
	type IParsedLink,
	removeLinkSuffix,
} from "@superset/shared/terminal-link-parsing";
import type { TerminalLinkResolver } from "./link-resolver";

const MAX_LINE_LENGTH = 2000;
const MAX_RESOLVED_LINKS_IN_LINE = 10;
const MAX_RESOLVED_LINK_LENGTH = 1024;

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

			if (resolved) {
				const linkStart = parsedLink.prefix?.index ?? parsedLink.path.index;
				const linkEnd = parsedLink.suffix
					? parsedLink.suffix.suffix.index +
						parsedLink.suffix.suffix.text.length
					: parsedLink.path.index + parsedLink.path.text.length;

				links.push({
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
				});
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
