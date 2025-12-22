import type { Terminal } from "@xterm/xterm";
import {
	type LinkMatch,
	MultiLineLinkProvider,
} from "./multi-line-link-provider";

const TRAILING_PUNCTUATION = /[.,;:!?]+$/;

export class UrlLinkProvider extends MultiLineLinkProvider {
	private readonly URL_PATTERN =
		/\bhttps?:\/\/(?:[^\s<>[\]()'"]+|\([^\s<>[\]()'"]*\))+/g;

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
		const trimmed = match.text.replace(TRAILING_PUNCTUATION, "");
		if (trimmed === match.text) {
			return match;
		}
		const charsRemoved = match.text.length - trimmed.length;
		return {
			...match,
			text: trimmed,
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
