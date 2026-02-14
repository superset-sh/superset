import type { Terminal } from "ghostty-web";

export interface SearchOptions {
	caseSensitive?: boolean;
}

export interface SearchMatch {
	/** Buffer line index (0-based) */
	lineIndex: number;
	/** Start column within the line (0-based) */
	startCol: number;
	/** End column (exclusive) */
	endCol: number;
}

/**
 * Custom terminal search engine that walks the ghostty-web buffer API.
 * Replaces @xterm/addon-search functionality.
 */
export class TerminalSearchEngine {
	private matches: SearchMatch[] = [];
	private activeMatchIndex = -1;
	private lastQuery = "";
	private lastCaseSensitive = false;

	constructor(private readonly terminal: Terminal) {}

	/**
	 * Find the next occurrence of query, wrapping at end of buffer.
	 * Returns true if a match was found.
	 */
	findNext(query: string, options: SearchOptions = {}): boolean {
		if (!query) {
			this.clearDecorations();
			return false;
		}

		const caseSensitive = options.caseSensitive ?? false;

		// Re-search if query or options changed
		if (query !== this.lastQuery || caseSensitive !== this.lastCaseSensitive) {
			this.searchBuffer(query, caseSensitive);
		}

		if (this.matches.length === 0) return false;

		// Advance to next match
		this.activeMatchIndex = (this.activeMatchIndex + 1) % this.matches.length;

		this.scrollToActiveMatch();
		return true;
	}

	/**
	 * Find the previous occurrence of query, wrapping at start of buffer.
	 * Returns true if a match was found.
	 */
	findPrevious(query: string, options: SearchOptions = {}): boolean {
		if (!query) {
			this.clearDecorations();
			return false;
		}

		const caseSensitive = options.caseSensitive ?? false;

		// Re-search if query or options changed
		if (query !== this.lastQuery || caseSensitive !== this.lastCaseSensitive) {
			this.searchBuffer(query, caseSensitive);
		}

		if (this.matches.length === 0) return false;

		// Move to previous match
		this.activeMatchIndex =
			(this.activeMatchIndex - 1 + this.matches.length) % this.matches.length;

		this.scrollToActiveMatch();
		return true;
	}

	/**
	 * Clear all search state and decorations.
	 */
	clearDecorations(): void {
		this.matches = [];
		this.activeMatchIndex = -1;
		this.lastQuery = "";
		this.lastCaseSensitive = false;
	}

	/**
	 * Get the current match count.
	 */
	get matchCount(): number {
		return this.matches.length;
	}

	/**
	 * Get the current active match index (0-based), or -1 if no match.
	 */
	get activeIndex(): number {
		return this.activeMatchIndex;
	}

	/**
	 * Get all current matches (for highlight overlay).
	 */
	getMatches(): ReadonlyArray<SearchMatch> {
		return this.matches;
	}

	/**
	 * Get the active match (for highlight overlay).
	 */
	getActiveMatch(): SearchMatch | null {
		if (
			this.activeMatchIndex < 0 ||
			this.activeMatchIndex >= this.matches.length
		) {
			return null;
		}
		return this.matches[this.activeMatchIndex];
	}

	private searchBuffer(query: string, caseSensitive: boolean): void {
		this.lastQuery = query;
		this.lastCaseSensitive = caseSensitive;
		this.matches = [];
		this.activeMatchIndex = -1;

		const buffer = this.terminal.buffer.active;
		const searchQuery = caseSensitive ? query : query.toLowerCase();

		for (let i = 0; i < buffer.length; i++) {
			const line = buffer.getLine(i);
			if (!line) continue;

			const lineText = line.translateToString(true);
			const searchText = caseSensitive ? lineText : lineText.toLowerCase();

			let startIndex = 0;
			while (startIndex < searchText.length) {
				const matchIndex = searchText.indexOf(searchQuery, startIndex);
				if (matchIndex === -1) break;

				this.matches.push({
					lineIndex: i,
					startCol: matchIndex,
					endCol: matchIndex + query.length,
				});

				startIndex = matchIndex + 1;
			}
		}

		if (this.matches.length > 0) {
			this.activeMatchIndex = 0;
		}
	}

	private scrollToActiveMatch(): void {
		if (this.activeMatchIndex < 0) return;
		const match = this.matches[this.activeMatchIndex];
		if (!match) return;

		// Scroll the terminal to show the match line
		const buffer = this.terminal.buffer.active;
		const viewportTop = buffer.viewportY;
		const viewportBottom = viewportTop + this.terminal.rows - 1;

		if (match.lineIndex < viewportTop || match.lineIndex > viewportBottom) {
			// Scroll so the match is roughly centered in the viewport
			const targetScroll = Math.max(
				0,
				match.lineIndex - Math.floor(this.terminal.rows / 2),
			);
			this.terminal.scrollToLine(targetScroll);
		}
	}
}
