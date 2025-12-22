import type { ILink, ILinkProvider, Terminal } from "@xterm/xterm";

/**
 * Match result from the pattern matching phase.
 */
export interface LinkMatch {
	/** Full matched text */
	text: string;
	/** Match index in combined text */
	index: number;
	/** Match end index in combined text */
	end: number;
	/** The combined text context for additional filtering */
	combinedText: string;
	/** Captured groups from regex */
	groups: RegExpMatchArray;
}

/**
 * Abstract base class for link providers that need to handle links spanning
 * multiple wrapped terminal lines.
 *
 * Terminal line wrapping can split paths/URLs mid-string. This class handles:
 * 1. Detecting wrapped lines (via isWrapped property)
 * 2. Combining adjacent wrapped lines for pattern matching
 * 3. Filtering matches to those overlapping the current line
 * 4. Calculating accurate multi-line link ranges
 *
 * Subclasses must implement:
 * - getPattern(): The regex pattern to match
 * - shouldSkipMatch(): Filter out false positives
 * - handleActivation(): Action when link is clicked
 */
export abstract class MultiLineLinkProvider implements ILinkProvider {
	constructor(protected readonly terminal: Terminal) {}

	/**
	 * Returns the regex pattern for matching links.
	 * The pattern should have the global flag if you want multiple matches per line.
	 */
	protected abstract getPattern(): RegExp;

	/**
	 * Determines if a match should be skipped (false positive filtering).
	 * @param match The match details including text, context, and captured groups
	 * @returns true if the match should be skipped
	 */
	protected abstract shouldSkipMatch(match: LinkMatch): boolean;

	/**
	 * Handles the activation of a matched link.
	 * @param event The mouse event that triggered activation
	 * @param text The matched text
	 * @param groups The regex captured groups
	 */
	protected abstract handleActivation(
		event: MouseEvent,
		text: string,
		groups: RegExpMatchArray,
	): void;

	provideLinks(
		bufferLineNumber: number,
		callback: (links: ILink[] | undefined) => void,
	): void {
		const lineIndex = bufferLineNumber - 1;
		const line = this.terminal.buffer.active.getLine(lineIndex);
		if (!line) {
			callback(undefined);
			return;
		}

		const lineText = line.translateToString(true);
		const lineLength = lineText.length;
		const isCurrentLineWrapped = line.isWrapped;

		// Check previous line if current line is a wrapped continuation
		const prevLine = isCurrentLineWrapped
			? this.terminal.buffer.active.getLine(lineIndex - 1)
			: null;
		const prevLineText = prevLine ? prevLine.translateToString(true) : "";
		const prevLineLength = prevLineText.length;

		// Check if the next line is a wrapped continuation of this line
		const nextLine = this.terminal.buffer.active.getLine(lineIndex + 1);
		const nextLineIsWrapped = nextLine?.isWrapped ?? false;
		const nextLineText =
			nextLineIsWrapped && nextLine ? nextLine.translateToString(true) : "";

		// Combined text for matching paths that may span wrap points
		// Format: [prevLine] + currentLine + [nextLine]
		const combinedText = prevLineText + lineText + nextLineText;
		const currentLineOffset = prevLineLength; // Offset where current line starts in combined text

		const links: ILink[] = [];
		const regex = this.getPattern();

		for (const match of combinedText.matchAll(regex)) {
			const matchText = match[0];
			const matchIndex = match.index ?? 0;
			const matchEnd = matchIndex + matchText.length;

			// Only process matches that overlap with the current line
			// Skip if match is entirely in previous line or entirely in next line
			const currentLineStart = currentLineOffset;
			const currentLineEnd = currentLineOffset + lineLength;

			if (matchEnd <= currentLineStart || matchIndex >= currentLineEnd) {
				// Match doesn't touch current line, skip it
				continue;
			}

			const linkMatch: LinkMatch = {
				text: matchText,
				index: matchIndex,
				end: matchEnd,
				combinedText,
				groups: match,
			};

			if (this.shouldSkipMatch(linkMatch)) {
				continue;
			}

			// Calculate the link range across potentially multiple lines
			const range = this.calculateLinkRange(
				matchIndex,
				matchEnd,
				prevLineLength,
				lineLength,
				bufferLineNumber,
				isCurrentLineWrapped,
				nextLineIsWrapped,
			);

			links.push({
				range,
				text: matchText,
				activate: (event: MouseEvent, text: string) => {
					this.handleActivation(event, text, match);
				},
			});
		}

		callback(links.length > 0 ? links : undefined);
	}

	/**
	 * Calculates the link range accounting for multi-line spans.
	 */
	private calculateLinkRange(
		matchIndex: number,
		matchEnd: number,
		prevLineLength: number,
		lineLength: number,
		bufferLineNumber: number,
		isCurrentLineWrapped: boolean,
		nextLineIsWrapped: boolean,
	): ILink["range"] {
		const currentLineStart = prevLineLength;
		const currentLineEnd = prevLineLength + lineLength;

		// Determine which lines the match spans
		const startsInPrevLine =
			isCurrentLineWrapped && matchIndex < currentLineStart;
		const endsInNextLine = nextLineIsWrapped && matchEnd > currentLineEnd;

		let startY: number;
		let startX: number;
		let endY: number;
		let endX: number;

		if (startsInPrevLine) {
			// Match starts in previous line
			startY = bufferLineNumber - 1;
			startX = matchIndex + 1;
		} else {
			// Match starts in current line
			startY = bufferLineNumber;
			startX = matchIndex - currentLineStart + 1;
		}

		if (endsInNextLine) {
			// Match ends in next line
			endY = bufferLineNumber + 1;
			endX = matchEnd - currentLineEnd + 1;
		} else if (matchEnd <= currentLineStart) {
			// Match ends in previous line (shouldn't happen due to earlier filter)
			endY = bufferLineNumber - 1;
			endX = matchEnd + 1;
		} else {
			// Match ends in current line
			endY = bufferLineNumber;
			endX = matchEnd - currentLineStart + 1;
		}

		return {
			start: { x: startX, y: startY },
			end: { x: endX, y: endY },
		};
	}
}
