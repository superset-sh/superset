import type { Terminal } from "@xterm/xterm";
import { getUrlTooltipText } from "./link-tooltip";
import {
	type LinkMatch,
	MultiLineLinkProvider,
} from "./multi-line-link-provider";
import { cleanUrlMatch, URL_PATTERN_SOURCE } from "./url-utils";

export class UrlLinkProvider extends MultiLineLinkProvider {
	constructor(
		terminal: Terminal,
		private readonly onOpen: (event: MouseEvent, uri: string) => void,
	) {
		super(terminal);
	}

	protected getTooltipText(): string {
		return getUrlTooltipText();
	}

	protected getPattern(): RegExp {
		return new RegExp(URL_PATTERN_SOURCE, "g");
	}

	protected shouldSkipMatch(_match: LinkMatch): boolean {
		return false;
	}

	protected transformMatch(match: LinkMatch): LinkMatch | null {
		const text = cleanUrlMatch(match.text);

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
