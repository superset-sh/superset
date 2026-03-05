import type { Terminal } from "@xterm/xterm";

export interface TerminalSearchOptions {
	caseSensitive?: boolean;
	regex?: boolean;
}

export interface TerminalSearchAdapter {
	findNext: (query: string, options?: TerminalSearchOptions) => boolean;
	findPrevious: (query: string, options?: TerminalSearchOptions) => boolean;
	clearDecorations: () => void;
}

interface SearchMatch {
	row: number;
	column: number;
	length: number;
}

function escapeRegex(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function getCursorBufferRow(terminal: Terminal): number {
	const buffer = terminal.buffer.active;
	if (buffer.baseY > 0) {
		return buffer.viewportY + buffer.cursorY;
	}

	// ghostty-web uses viewportY as "lines above bottom".
	const scrollbackLength = Math.max(0, buffer.length - terminal.rows);
	const viewportOffset = Math.max(0, Math.floor(buffer.viewportY));
	return Math.max(
		0,
		Math.min(
			buffer.length - 1,
			scrollbackLength - viewportOffset + buffer.cursorY,
		),
	);
}

function createPattern(
	query: string,
	options: TerminalSearchOptions,
): RegExp | null {
	if (!query) return null;
	const source = options.regex ? query : escapeRegex(query);
	const flags = options.caseSensitive ? "g" : "gi";
	try {
		return new RegExp(source, flags);
	} catch {
		return null;
	}
}

function findNextInLine(
	text: string,
	startColumn: number,
	pattern: RegExp,
): { column: number; length: number } | null {
	pattern.lastIndex = Math.max(0, startColumn);
	const match = pattern.exec(text);
	if (!match || match[0].length === 0) return null;
	return { column: match.index, length: match[0].length };
}

function findPreviousInLine(
	text: string,
	maxColumn: number,
	pattern: RegExp,
): { column: number; length: number } | null {
	let last: { column: number; length: number } | null = null;
	pattern.lastIndex = 0;

	for (const match of text.matchAll(pattern)) {
		if ((match.index ?? -1) > maxColumn) {
			break;
		}
		if (!match[0] || match[0].length === 0) {
			continue;
		}
		last = { column: match.index ?? 0, length: match[0].length };
	}

	return last;
}

export function createTerminalSearchAdapter(
	terminal: Terminal,
): TerminalSearchAdapter {
	let lastQuery: string | null = null;
	let lastMatch: SearchMatch | null = null;

	const applyMatch = (match: SearchMatch) => {
		terminal.clearSelection();
		terminal.select(match.column, match.row, match.length);
		const targetRow = Math.max(0, match.row - Math.floor(terminal.rows / 2));
		terminal.scrollToLine(targetRow);
		lastMatch = match;
	};

	const find = (
		query: string,
		options: TerminalSearchOptions,
		direction: "next" | "previous",
	): boolean => {
		const pattern = createPattern(query, options);
		if (!pattern) return false;

		const buffer = terminal.buffer.active;
		const totalRows = buffer.length;
		if (totalRows <= 0) return false;

		const selection = terminal.getSelectionPosition();
		const hasSameQuery = lastQuery === query;

		let startRow = getCursorBufferRow(terminal);
		let startColumn = 0;

		if (selection) {
			if (direction === "next") {
				startRow = selection.end.y;
				startColumn = selection.end.x + 1;
			} else {
				startRow = selection.start.y;
				startColumn = selection.start.x - 1;
			}
		} else if (hasSameQuery && lastMatch) {
			startRow = lastMatch.row;
			startColumn =
				direction === "next"
					? lastMatch.column + 1
					: lastMatch.column + lastMatch.length - 1;
		}

		startRow = Math.max(0, Math.min(totalRows - 1, startRow));

		for (let index = 0; index < totalRows; index++) {
			const row =
				direction === "next"
					? (startRow + index) % totalRows
					: (startRow - index + totalRows) % totalRows;
			const lineText = buffer.getLine(row)?.translateToString(false) ?? "";

			if (direction === "next") {
				const fromColumn = index === 0 ? startColumn : 0;
				const next = findNextInLine(lineText, fromColumn, pattern);
				if (!next) continue;
				applyMatch({ row, column: next.column, length: next.length });
				lastQuery = query;
				return true;
			}

			const fromColumn = index === 0 ? startColumn : lineText.length - 1;
			const prev = findPreviousInLine(lineText, fromColumn, pattern);
			if (!prev) continue;
			applyMatch({ row, column: prev.column, length: prev.length });
			lastQuery = query;
			return true;
		}

		return false;
	};

	return {
		findNext: (query, options = {}) => find(query, options, "next"),
		findPrevious: (query, options = {}) => find(query, options, "previous"),
		clearDecorations: () => {
			lastQuery = null;
			lastMatch = null;
			terminal.clearSelection();
		},
	};
}
