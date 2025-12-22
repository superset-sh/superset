import type { Terminal } from "@xterm/xterm";
import {
	type LinkMatch,
	MultiLineLinkProvider,
} from "./multi-line-link-provider";

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

	protected handleActivation(event: MouseEvent, text: string): void {
		if (!event.metaKey && !event.ctrlKey) {
			return;
		}

		event.preventDefault();
		this.onOpen(event, text);
	}
}
