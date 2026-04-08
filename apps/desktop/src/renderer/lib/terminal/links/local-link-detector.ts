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
import type {
	LinkResolverOptions,
	TerminalLinkResolver,
} from "./link-resolver";

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

export interface LocalLinkDetectorOptions {
	initialCwd: string | undefined;
	userHome: string | undefined;
}

/**
 * Detects local file-system links in a line of terminal text.
 *
 * The flow matches VSCode's TerminalLocalLinkDetector:
 * 1. Parse the line with `detectLinks()` (already vendored from VSCode)
 * 2. For each parsed link, build candidate paths (absolute, relative to cwd, trimmed variants)
 * 3. Validate each candidate against the filesystem via the resolver
 * 4. Only return links that point to real files/directories
 * 5. If no primary links found, try fallback matchers (Python, Rust, C++, etc.)
 */
export class LocalLinkDetector {
	constructor(
		private readonly _resolver: TerminalLinkResolver,
		private readonly _opts: LocalLinkDetectorOptions,
	) {}

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

			const resolverOpts: LinkResolverOptions = {
				initialCwd: this._opts.initialCwd,
				userHome: this._opts.userHome,
			};
			const resolved = await this._resolver.resolveMultipleCandidates(
				allCandidates,
				resolverOpts,
			);

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

				const resolverOpts: LinkResolverOptions = {
					initialCwd: this._opts.initialCwd,
					userHome: this._opts.userHome,
				};
				const resolved = await this._resolver.resolveLink(
					fallback.path,
					resolverOpts,
				);
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
	 * Tries the path as-is first (for absolute/tilde/file:// paths), then
	 * includes the raw text for relative resolution by the resolver.
	 */
	private _buildCandidates(pathText: string): string[] {
		const candidates: string[] = [];

		// Strip the line/column suffix for path resolution
		const cleanPath = removeLinkSuffix(pathText);
		if (!cleanPath) {
			return candidates;
		}

		candidates.push(cleanPath);

		// For relative paths with leading ../, also try without the ../ prefix
		// (VSCode pattern: handles cases where the relative prefix is wrong)
		const parentPrefixMatch = cleanPath.match(/^(\.\.[/\\])+/);
		if (parentPrefixMatch) {
			candidates.push(cleanPath.replace(/^(\.\.[/\\])+/, ""));
		}

		return candidates;
	}
}
