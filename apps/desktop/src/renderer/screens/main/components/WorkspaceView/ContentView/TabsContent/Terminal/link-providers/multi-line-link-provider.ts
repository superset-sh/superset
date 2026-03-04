import type { ILink, ILinkProvider, Terminal } from "@xterm/xterm";

export interface LinkMatch {
	text: string;
	index: number;
	end: number;
	combinedText: string;
	regexMatch: RegExpMatchArray;
}

export interface ContextLine {
	index: number;
	lineNumber: number;
	text: string;
	leadingTrim: number;
}

interface ContextLineWithOffsets extends ContextLine {
	startOffset: number;
	endOffset: number;
}

interface MatchRangeContext {
	bufferLineNumber: number;
	currentLine: ContextLineWithOffsets;
	lines: ContextLineWithOffsets[];
}

/**
 * Abstract base class for terminal link providers that handles links spanning
 * up to 3 wrapped lines (previous + current + next). Links spanning 4+ wrapped
 * lines will be truncated.
 */
export abstract class MultiLineLinkProvider implements ILinkProvider {
	constructor(protected readonly terminal: Terminal) {}

	protected abstract getPattern(): RegExp;
	protected abstract shouldSkipMatch(match: LinkMatch): boolean;
	protected abstract handleActivation(
		event: MouseEvent,
		text: string,
		regexMatch: RegExpMatchArray,
	): void;

	/**
	 * Optional hook to transform a match before creating the link.
	 * Useful for stripping trailing characters. Return null to skip the match.
	 */
	protected transformMatch(match: LinkMatch): LinkMatch | null {
		return match;
	}

	protected buildRangesForMatch(
		matchIndex: number,
		matchEnd: number,
		context: MatchRangeContext,
	): ILink["range"][] {
		return [this.calculateLinkRange(matchIndex, matchEnd, context.lines)];
	}

	protected buildContextLines(lineIndex: number): ContextLine[] {
		const line = this.terminal.buffer.active.getLine(lineIndex);
		if (!line) {
			return [];
		}

		const lines: ContextLine[] = [];

		if (line.isWrapped) {
			const prevLine = this.terminal.buffer.active.getLine(lineIndex - 1);
			if (prevLine) {
				lines.push({
					index: lineIndex - 1,
					lineNumber: lineIndex,
					text: prevLine.translateToString(true),
					leadingTrim: 0,
				});
			}
		}

		lines.push({
			index: lineIndex,
			lineNumber: lineIndex + 1,
			text: line.translateToString(true),
			leadingTrim: 0,
		});

		const nextLine = this.terminal.buffer.active.getLine(lineIndex + 1);
		if (nextLine?.isWrapped) {
			lines.push({
				index: lineIndex + 1,
				lineNumber: lineIndex + 2,
				text: nextLine.translateToString(true),
				leadingTrim: 0,
			});
		}

		return lines;
	}

	provideLinks(
		bufferLineNumber: number,
		callback: (links: ILink[] | undefined) => void,
	): void {
		const lineIndex = bufferLineNumber - 1;
		const contextLines = this.buildContextLines(lineIndex);
		if (contextLines.length === 0) {
			callback(undefined);
			return;
		}

		const linesWithOffsets: ContextLineWithOffsets[] = [];
		let runningOffset = 0;
		for (const contextLine of contextLines) {
			const startOffset = runningOffset;
			const endOffset = startOffset + contextLine.text.length;
			linesWithOffsets.push({
				...contextLine,
				startOffset,
				endOffset,
			});
			runningOffset = endOffset;
		}

		const currentLine = linesWithOffsets.find(
			(line) => line.index === lineIndex,
		);
		if (!currentLine) {
			callback(undefined);
			return;
		}

		const combinedText = linesWithOffsets.map((line) => line.text).join("");

		const links: ILink[] = [];
		const regex = this.getPattern();

		for (const match of combinedText.matchAll(regex)) {
			const matchText = match[0];
			const matchIndex = match.index ?? 0;
			const matchEnd = matchIndex + matchText.length;

			if (
				matchEnd <= currentLine.startOffset ||
				matchIndex >= currentLine.endOffset
			) {
				continue;
			}

			let linkMatch: LinkMatch | null = {
				text: matchText,
				index: matchIndex,
				end: matchEnd,
				combinedText,
				regexMatch: match,
			};

			if (this.shouldSkipMatch(linkMatch)) {
				continue;
			}

			linkMatch = this.transformMatch(linkMatch);
			if (!linkMatch) {
				continue;
			}

			const ranges = this.buildRangesForMatch(linkMatch.index, linkMatch.end, {
				bufferLineNumber,
				currentLine,
				lines: linesWithOffsets,
			});

			for (const range of ranges) {
				links.push({
					range,
					text: linkMatch.text,
					activate: (event: MouseEvent, text: string) => {
						this.handleActivation(event, text, match);
					},
				});
			}
		}

		callback(links.length > 0 ? links : undefined);
	}

	private offsetToPosition(
		offset: number,
		lines: ContextLineWithOffsets[],
		isEnd: boolean,
	): { x: number; y: number } {
		for (const line of lines) {
			const isInLine = isEnd
				? offset <= line.endOffset
				: offset < line.endOffset ||
					(offset === line.startOffset && line.text.length === 0);
			if (!isInLine) {
				continue;
			}

			const localOffset = Math.max(
				0,
				Math.min(offset - line.startOffset, line.text.length),
			);
			return {
				x: line.leadingTrim + localOffset + 1,
				y: line.lineNumber,
			};
		}

		const lastLine = lines[lines.length - 1];
		if (!lastLine) {
			return { x: 1, y: 1 };
		}
		return {
			x: lastLine.leadingTrim + lastLine.text.length + 1,
			y: lastLine.lineNumber,
		};
	}

	protected calculateLinkRange(
		matchIndex: number,
		matchEnd: number,
		lines: ContextLineWithOffsets[],
	): ILink["range"] {
		const start = this.offsetToPosition(matchIndex, lines, false);
		const end = this.offsetToPosition(matchEnd, lines, true);

		return {
			start,
			end,
		};
	}
}
