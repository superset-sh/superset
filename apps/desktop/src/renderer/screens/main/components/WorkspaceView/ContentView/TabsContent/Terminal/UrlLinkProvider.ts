import type { Terminal } from "@xterm/xterm";
import { type LinkMatch, MultiLineLinkProvider } from "./MultiLineLinkProvider";

export class UrlLinkProvider extends MultiLineLinkProvider {
	// Match URLs with various protocols
	// Handles balanced parentheses (like Wikipedia URLs) and excludes trailing punctuation
	private readonly URL_PATTERN =
		/\bhttps?:\/\/(?:[^\s<>[\]()'"]+|\([^\s<>[\]()'"]*\))+/g;

	constructor(
		terminal: Terminal,
		private readonly onOpen: (event: MouseEvent, uri: string) => void,
	) {
		super(terminal);
	}

	protected getPattern(): RegExp {
		// Return a new instance to reset lastIndex for global regex
		return new RegExp(this.URL_PATTERN.source, "g");
	}

	protected shouldSkipMatch(_match: LinkMatch): boolean {
		// We accept all URL matches that pass the pattern
		return false;
	}

	protected handleActivation(event: MouseEvent, text: string): void {
		// Only open URLs on CMD+click (Mac) or Ctrl+click (Windows/Linux)
		if (!event.metaKey && !event.ctrlKey) {
			return;
		}

		event.preventDefault();
		this.onOpen(event, text);
	}
}
