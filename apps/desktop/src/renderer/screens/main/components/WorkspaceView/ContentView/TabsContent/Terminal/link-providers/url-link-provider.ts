import type { Terminal } from "@xterm/xterm";
import {
	type ContextLine,
	type LinkMatch,
	MultiLineLinkProvider,
} from "./multi-line-link-provider";

const TRAILING_PUNCTUATION = /[.,;:!?]+$/;
const URL_AT_END_PATTERN = /https?:\/\/[^\s<>[\]'"]+$/;
const URL_CONTINUATION_PATTERN = /^[^\s<>[\]'"]+/;
const URL_SCHEME_PATTERN = /^https?:\/\//i;
const HARD_WRAP_COLS_TOLERANCE = 2;
const URL_CONTINUATION_SIGNAL_PATTERN = /[./?&=#%_-]/;
const URL_CONTINUATION_PREV_END_PATTERN = /[/?#=&%._-]/;
const URL_BREAK_SIGNAL_PATTERN = /[-/?#=&%]/;

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

	private isLikelyUrlContinuation(
		prevRawText: string,
		continuationText: string,
		leadingTrim: number,
	): boolean {
		const trimmedPrev = prevRawText.trimEnd();
		const prevEnd = trimmedPrev.at(-1) ?? "";
		const startsWithDigit = /^[0-9]/.test(continuationText);
		const hasUrlSignal = URL_CONTINUATION_SIGNAL_PATTERN.test(continuationText);
		const prevSuggestsContinuation =
			URL_CONTINUATION_PREV_END_PATTERN.test(prevEnd);
		const explicitWrappedFormatting = leadingTrim > 0;

		// Accept continuation when this looks like a viewport wrap, a markdown-style
		// wrapped line, or when URL syntax strongly suggests continuation.
		return (
			this.isLikelyHardWrapBoundary(prevRawText) ||
			explicitWrappedFormatting ||
			URL_BREAK_SIGNAL_PATTERN.test(prevEnd) ||
			hasUrlSignal ||
			startsWithDigit ||
			prevSuggestsContinuation
		);
	}

	private getContinuationSegment(
		rawText: string,
	): { leadingTrim: number; text: string } | null {
		const leadingTrim = rawText.length - rawText.trimStart().length;
		const trimmed = rawText.slice(leadingTrim);
		if (!trimmed || URL_SCHEME_PATTERN.test(trimmed)) {
			return null;
		}

		const continuationMatch = trimmed.match(URL_CONTINUATION_PATTERN);
		const continuationText = continuationMatch?.[0];
		if (!continuationText) {
			return null;
		}

		return {
			leadingTrim,
			text: continuationText,
		};
	}

	private isLikelyContinuationLine(rawText: string): boolean {
		const continuation = this.getContinuationSegment(rawText);
		if (!continuation) {
			return false;
		}

		return (
			URL_CONTINUATION_SIGNAL_PATTERN.test(continuation.text) ||
			/^[0-9]/.test(continuation.text)
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
			!this.isLikelyContinuationLine(lastRawText)
		) {
			return false;
		}

		const nextRawText = nextBufferLine.translateToString(true);
		const continuation = this.getContinuationSegment(nextRawText);
		if (!continuation) {
			return false;
		}

		if (
			!this.isLikelyUrlContinuation(
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
			!this.isLikelyUrlContinuation(
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

		// Extend forward for TUI hard-wraps where lines are split by explicit newline
		// instead of xterm's soft-wrap flag.
		while (this.tryExtendForward(lines)) {}

		// Extend backward when scanning a continuation line directly.
		while (this.tryExtendBackward(lines)) {}

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
