import type { Terminal } from "ghostty-web";

interface SearchMatch {
	row: number;
	col: number;
	length: number;
}

interface SearchOptions {
	caseSensitive?: boolean;
}

/**
 * Buffer-based search engine for ghostty-web terminals.
 * Uses the terminal's buffer API + select() for highlighting.
 *
 * Limitation: Only one match highlighted at a time (no decorations API in ghostty-web).
 * UI shows "N of M" match count.
 */
export class TerminalSearchEngine {
	private terminal: Terminal;
	private matches: SearchMatch[] = [];
	private currentIndex = -1;

	constructor(terminal: Terminal) {
		this.terminal = terminal;
	}

	/**
	 * Search for query in the terminal buffer.
	 * Returns total match count.
	 */
	search(query: string, options: SearchOptions = {}): number {
		this.matches = [];
		this.currentIndex = -1;

		if (!query) {
			this.clearHighlight();
			return 0;
		}

		const buffer = this.terminal.buffer.active;
		const searchQuery = options.caseSensitive ? query : query.toLowerCase();

		for (let i = 0; i < buffer.length; i++) {
			const line = buffer.getLine(i);
			if (!line) continue;

			const lineText = line.translateToString(true);
			const searchText = options.caseSensitive
				? lineText
				: lineText.toLowerCase();

			let startIndex = 0;
			while (startIndex < searchText.length) {
				const matchIndex = searchText.indexOf(searchQuery, startIndex);
				if (matchIndex === -1) break;

				this.matches.push({
					row: i,
					col: matchIndex,
					length: query.length,
				});

				startIndex = matchIndex + 1;
			}
		}

		if (this.matches.length > 0) {
			// Start at the match closest to the current viewport bottom
			const viewportBottom = buffer.viewportY + this.terminal.rows;
			let closestIndex = 0;
			let closestDistance = Number.MAX_SAFE_INTEGER;

			for (let i = 0; i < this.matches.length; i++) {
				const distance = Math.abs(this.matches[i].row - viewportBottom);
				if (distance < closestDistance) {
					closestDistance = distance;
					closestIndex = i;
				}
			}

			this.currentIndex = closestIndex;
			this.highlightCurrent();
		}

		return this.matches.length;
	}

	/**
	 * Move to next match. Returns true if found.
	 */
	findNext(): boolean {
		if (this.matches.length === 0) return false;

		this.currentIndex = (this.currentIndex + 1) % this.matches.length;
		this.highlightCurrent();
		return true;
	}

	/**
	 * Move to previous match. Returns true if found.
	 */
	findPrevious(): boolean {
		if (this.matches.length === 0) return false;

		this.currentIndex =
			(this.currentIndex - 1 + this.matches.length) % this.matches.length;
		this.highlightCurrent();
		return true;
	}

	/**
	 * Clear the current highlight selection.
	 */
	clearHighlight(): void {
		this.terminal.clearSelection();
	}

	/**
	 * Get total match count.
	 */
	get matchCount(): number {
		return this.matches.length;
	}

	/**
	 * Get current match index (0-based). Returns -1 if no matches.
	 */
	get currentMatchIndex(): number {
		return this.currentIndex;
	}

	private highlightCurrent(): void {
		if (this.currentIndex < 0 || this.currentIndex >= this.matches.length)
			return;

		const match = this.matches[this.currentIndex];
		this.terminal.select(match.col, match.row, match.length);
		this.terminal.scrollToLine(match.row);
	}
}
