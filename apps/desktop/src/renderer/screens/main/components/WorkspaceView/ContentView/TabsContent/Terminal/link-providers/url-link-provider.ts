import type { Terminal } from "@xterm/xterm";
import {
	type LinkMatch,
	MultiLineLinkProvider,
} from "./multi-line-link-provider";

const TRAILING_PUNCTUATION = /[.,;:!?]+$/;

/**
 * Trim unbalanced trailing parentheses from a URL.
 * Keeps balanced parens (like Wikipedia URLs) but removes trailing ) without matching (.
 */
function trimUnbalancedParens(url: string): string {
	let openCount = 0;
	let lastValidIndex = url.length;

	for (let i = 0; i < url.length; i++) {
		if (url[i] === "(") {
			openCount++;
		} else if (url[i] === ")") {
			if (openCount > 0) {
				openCount--;
			} else {
				lastValidIndex = i;
				break;
			}
		}
	}

	return url.slice(0, lastValidIndex);
}

export class UrlLinkProvider extends MultiLineLinkProvider {
	// Simple pattern without nested quantifiers to avoid ReDoS
	// Parentheses handling is done in transformMatch
	private readonly URL_PATTERN = /\bhttps?:\/\/[^\s<>[\]'"]+/g;

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

		// Trim unbalanced trailing parentheses
		text = trimUnbalancedParens(text);

		// Trim trailing punctuation
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
