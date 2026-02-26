import type { Terminal } from "@xterm/xterm";
import {
	type ContextLine,
	type LinkMatch,
	MultiLineLinkProvider,
} from "./multi-line-link-provider";

const TRAILING_PUNCTUATION = /[.,;:!?]+$/;
const URL_AT_END_PATTERN = /https?:\/\/[^\s<>[\]'"]+$/;
const URL_INCOMPLETE_SCHEME_AT_END_PATTERN = /https?$/i;
const URL_CONTINUATION_PATTERN = /^[^\s<>[\]'"]+/;
const URL_SCHEME_PATTERN = /^https?:\/\//i;
const HARD_WRAP_COLS_TOLERANCE = 2;
const URL_BREAK_SIGNAL_PATTERN = /[-/?#=&%._~]/;
const URL_CONTINUATION_SIGNAL_PATTERN = /[/?#=&%._~-]/;
const MAX_HARD_WRAP_EXTENSION_LINES = 24;
const MAX_HARD_WRAP_URL_LENGTH = 4096;
const LIST_MARKER_LINE_PATTERN = /^(?:[-*+•]|\d+[.)])\s+/;
const PROMPT_LINE_PATTERN = /^(?:[$#>]{1,3}|❯)\s+/;
const TABLE_MARKER_LINE_PATTERN = /^(?:\||│|┆|┃|├|└|┌|┐|┘|┬|┴|┼)/;

function trimUnbalancedParens(url: string): string {
	let openCount = 0;
	let endIndex = url.length;

	for (let i = 0; i < url.length; i++) {
		if (url[i] === "(") {
			openCount++;
		} else if (url[i] === ")") {
			if (openCount > 0) {
				openCount--;
			} else {
				endIndex = i;
				break;
			}
		}
	}

	let result = url.slice(0, endIndex);

	while (result.endsWith("(")) {
		result = result.slice(0, -1);
	}

	return result;
}

export class UrlLinkProvider extends MultiLineLinkProvider {
	private readonly URL_PATTERN = /\bhttps?:\/\/[^\s<>[\]'"]+/g;

	private createContextLine(
		index: number,
		text: string,
		leadingTrim = 0,
	): ContextLine {
		return {
			index,
			lineNumber: index + 1,
			text,
			leadingTrim,
		};
	}

	private getContextText(lines: ContextLine[]): string {
		return lines.map((line) => line.text).join("");
	}

	private getLine(index: number) {
		return this.terminal.buffer.active.getLine(index);
	}

	private getLineText(index: number): string | null {
		return this.getLine(index)?.translateToString(true) ?? null;
	}

	private isLikelyHardWrapBoundary(text: string): boolean {
		const cols = this.terminal.cols;
		if (typeof cols !== "number" || cols <= 0) {
			return false;
		}
		return text.length >= Math.max(1, cols - HARD_WRAP_COLS_TOLERANCE);
	}

	private getContinuationSegment(
		rawText: string,
	): { leadingTrim: number; text: string } | null {
		const leadingTrim = rawText.length - rawText.trimStart().length;
		const trimmed = rawText.slice(leadingTrim);
		if (!trimmed || URL_SCHEME_PATTERN.test(trimmed)) {
			return null;
		}
		if (this.isBoundaryMarkerLine(trimmed)) {
			return null;
		}

		const continuationMatch = trimmed.match(URL_CONTINUATION_PATTERN);
		const continuationText = continuationMatch?.[0];
		if (!continuationText) {
			return null;
		}
		if (!/[A-Za-z0-9]/.test(continuationText)) {
			return null;
		}

		return {
			leadingTrim,
			text: continuationText,
		};
	}

	private isBoundaryMarkerLine(trimmedLine: string): boolean {
		return (
			LIST_MARKER_LINE_PATTERN.test(trimmedLine) ||
			PROMPT_LINE_PATTERN.test(trimmedLine) ||
			TABLE_MARKER_LINE_PATTERN.test(trimmedLine)
		);
	}

	private shouldAcceptContinuation(
		prevRawText: string,
		continuationText: string,
		leadingTrim: number,
	): boolean {
		const trimmedPrev = prevRawText.trimEnd();
		const prevEnd = trimmedPrev.at(-1) ?? "";
		const boundaryLooksWrapped =
			this.isLikelyHardWrapBoundary(prevRawText) ||
			leadingTrim > 0 ||
			URL_BREAK_SIGNAL_PATTERN.test(prevEnd);
		const continuationHasUrlSignal =
			URL_CONTINUATION_SIGNAL_PATTERN.test(continuationText) ||
			/^[0-9]/.test(continuationText);
		const continuationAfterUrlBreak =
			URL_BREAK_SIGNAL_PATTERN.test(prevEnd) &&
			/^[A-Za-z0-9]/.test(continuationText);
		const continuationLooksLikeWrappedWord =
			leadingTrim > 0 &&
			/^[A-Za-z0-9]/.test(continuationText) &&
			/[A-Za-z0-9]$/.test(trimmedPrev);
		const continuationLooksUrlLike =
			continuationHasUrlSignal ||
			continuationAfterUrlBreak ||
			continuationLooksLikeWrappedWord;
		const continuationStartsHyphenToken = continuationText.startsWith("-");
		const hyphenTokenLooksUrlLike =
			continuationText.length > 1 &&
			(/[&/?#=.%_~]/.test(continuationText) ||
				URL_BREAK_SIGNAL_PATTERN.test(prevEnd));
		const continuationStartsListMarker =
			prevEnd !== "-" && /^-(?:https?:\/\/|www\.)/i.test(continuationText);
		const prevIsBoundaryMarkerLine = this.isBoundaryMarkerLine(
			prevRawText.trimStart(),
		);

		return (
			boundaryLooksWrapped &&
			continuationLooksUrlLike &&
			(!continuationStartsHyphenToken || hyphenTokenLooksUrlLike) &&
			(!prevIsBoundaryMarkerLine || URL_AT_END_PATTERN.test(prevRawText)) &&
			!continuationStartsListMarker
		);
	}

	private isLikelyContinuationLine(rawText: string): boolean {
		const continuation = this.getContinuationSegment(rawText);
		if (!continuation) {
			return false;
		}
		return (
			URL_CONTINUATION_SIGNAL_PATTERN.test(continuation.text) ||
			/^[0-9]/.test(continuation.text) ||
			(continuation.leadingTrim > 0 && /^[A-Za-z0-9]/.test(continuation.text))
		);
	}

	private tryExtendForward(lines: ContextLine[]): boolean {
		const last = lines[lines.length - 1];
		if (!last) {
			return false;
		}

		const nextBufferLine = this.getLine(last.index + 1);
		if (!nextBufferLine || nextBufferLine.isWrapped) {
			return false;
		}

		const lastRawText = this.getLineText(last.index);
		if (!lastRawText) {
			return false;
		}

		const combinedTail = this.getContextText(lines);
		if (
			!URL_AT_END_PATTERN.test(combinedTail) &&
			!URL_INCOMPLETE_SCHEME_AT_END_PATTERN.test(combinedTail.trimEnd())
		) {
			return false;
		}

		const nextRawText = nextBufferLine.translateToString(true);
		const continuation = this.getContinuationSegment(nextRawText);
		if (!continuation) {
			return false;
		}
		if (
			this.getContextText(lines).length + continuation.text.length >
			MAX_HARD_WRAP_URL_LENGTH
		) {
			return false;
		}

		if (
			!this.shouldAcceptContinuation(
				lastRawText,
				continuation.text,
				continuation.leadingTrim,
			)
		) {
			return false;
		}

		lines.push(
			this.createContextLine(
				last.index + 1,
				continuation.text,
				continuation.leadingTrim,
			),
		);
		return true;
	}

	private tryExtendBackward(lines: ContextLine[]): boolean {
		const first = lines[0];
		if (!first) {
			return false;
		}

		const prevBufferLine = this.getLine(first.index - 1);
		if (!prevBufferLine || prevBufferLine.isWrapped) {
			return false;
		}

		const prevRawText = prevBufferLine.translateToString(true);
		const firstRawText = this.getLineText(first.index);
		if (!firstRawText) {
			return false;
		}

		const continuation = this.getContinuationSegment(firstRawText);
		if (!continuation) {
			return false;
		}
		if (
			this.getContextText(lines).length + prevRawText.length >
			MAX_HARD_WRAP_URL_LENGTH
		) {
			return false;
		}
		if (
			!URL_AT_END_PATTERN.test(prevRawText) &&
			!this.isLikelyContinuationLine(prevRawText) &&
			!URL_INCOMPLETE_SCHEME_AT_END_PATTERN.test(prevRawText.trimEnd())
		) {
			return false;
		}

		if (
			!this.shouldAcceptContinuation(
				prevRawText,
				continuation.text,
				continuation.leadingTrim,
			)
		) {
			return false;
		}

		lines[0] = {
			...first,
			text: continuation.text,
			leadingTrim: continuation.leadingTrim,
		};
		lines.unshift(this.createContextLine(first.index - 1, prevRawText));
		return true;
	}

	protected buildContextLines(lineIndex: number): ContextLine[] {
		const baseLines = super.buildContextLines(lineIndex);
		if (baseLines.length === 0) {
			return baseLines;
		}

		const lines = [...baseLines];

		let backwardExtensions = 0;
		while (
			backwardExtensions < MAX_HARD_WRAP_EXTENSION_LINES &&
			this.tryExtendBackward(lines)
		) {
			backwardExtensions++;
		}

		let forwardExtensions = 0;
		while (
			forwardExtensions < MAX_HARD_WRAP_EXTENSION_LINES &&
			this.tryExtendForward(lines)
		) {
			forwardExtensions++;
		}

		return lines;
	}

	constructor(
		terminal: Terminal,
		private readonly onOpen: (event: MouseEvent, uri: string) => void,
	) {
		super(terminal);
	}

	protected getPattern(): RegExp {
		return new RegExp(this.URL_PATTERN.source, "g");
	}

	protected shouldSkipMatch(_match: LinkMatch): boolean {
		return false;
	}

	protected transformMatch(match: LinkMatch): LinkMatch | null {
		let text = match.text;
		text = trimUnbalancedParens(text);
		text = text.replace(TRAILING_PUNCTUATION, "");

		if (text === match.text) {
			return match;
		}

		const charsRemoved = match.text.length - text.length;
		return {
			...match,
			text,
			end: match.end - charsRemoved,
		};
	}

	protected handleActivation(event: MouseEvent, text: string): void {
		if (!event.metaKey && !event.ctrlKey) {
			return;
		}

		event.preventDefault();
		this.onOpen(event, text);
	}
}
