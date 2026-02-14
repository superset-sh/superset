import type { ILink, ILinkProvider, Terminal } from "@xterm/xterm";
import { calculateLinkRange } from "./link-range";
import { TerminalLinkTooltip } from "./link-tooltip";

export interface LinkMatch {
	text: string;
	index: number;
	end: number;
	combinedText: string;
	regexMatch: RegExpMatchArray;
}

/**
 * Abstract base class for terminal link providers that handles links spanning
 * up to 3 wrapped lines (previous + current + next). Links spanning 4+ wrapped
 * lines will be truncated.
 */
export abstract class MultiLineLinkProvider implements ILinkProvider {
	private readonly tooltipHelper: TerminalLinkTooltip;

	constructor(protected readonly terminal: Terminal) {
		this.tooltipHelper = new TerminalLinkTooltip(terminal);
	}

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

	protected getTooltipText(): string | null {
		return null;
	}

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

		const prevLine = isCurrentLineWrapped
			? this.terminal.buffer.active.getLine(lineIndex - 1)
			: null;
		const prevLineText = prevLine ? prevLine.translateToString(true) : "";
		const prevLineLength = prevLineText.length;

		const nextLine = this.terminal.buffer.active.getLine(lineIndex + 1);
		const nextLineIsWrapped = nextLine?.isWrapped ?? false;
		const nextLineText =
			nextLineIsWrapped && nextLine ? nextLine.translateToString(true) : "";

		const combinedText = prevLineText + lineText + nextLineText;
		const currentLineOffset = prevLineLength;

		const links: ILink[] = [];
		const regex = this.getPattern();

		const tooltipText = this.getTooltipText();
		const hoverCallbacks = tooltipText
			? this.tooltipHelper.buildHoverCallbacks(tooltipText)
			: {};

		for (const match of combinedText.matchAll(regex)) {
			const matchText = match[0];
			const matchIndex = match.index ?? 0;
			const matchEnd = matchIndex + matchText.length;

			const currentLineStart = currentLineOffset;
			const currentLineEnd = currentLineOffset + lineLength;

			if (matchEnd <= currentLineStart || matchIndex >= currentLineEnd) {
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

			const range = calculateLinkRange({
				linkStart: linkMatch.index,
				linkEnd: linkMatch.end,
				prevLineLength,
				lineLength,
				bufferLineNumber,
				isCurrentLineWrapped,
				nextLineIsWrapped,
			});

			links.push({
				range,
				text: linkMatch.text,
				decorations: { pointerCursor: true, underline: true },
				activate: (event: MouseEvent, text: string) => {
					this.handleActivation(event, text, match);
				},
				...hoverCallbacks,
			});
		}

		callback(links.length > 0 ? links : undefined);
	}
}
