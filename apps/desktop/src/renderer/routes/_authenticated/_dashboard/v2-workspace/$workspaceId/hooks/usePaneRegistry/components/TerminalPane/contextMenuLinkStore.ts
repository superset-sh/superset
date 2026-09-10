import type { LinkHoverInfo } from "renderer/lib/terminal/terminal-runtime-registry";
import type { TerminalLinkActionDeps } from "./utils/runTerminalLinkAction";

/**
 * What the last right-click in a terminal pane landed on, and the deps needed
 * to act on it.
 *
 * The pane context menu is built by usePaneRegistry, which sits outside
 * TerminalPane and so can't see either the hovered link or the hooks that open
 * files, folders and URLs. TerminalPane publishes both here on `contextmenu`
 * (capture phase, before Radix opens the menu, while the pointer is still over
 * the link) and the menu reads them when it opens.
 *
 * Recording on the event rather than reading live hover state keeps the two in
 * step: a right-click on blank terminal writes null, so a stale link from an
 * earlier hover can never leak into the menu.
 */
interface PaneEntry {
	link: LinkHoverInfo | null;
	deps: TerminalLinkActionDeps;
}

const entries = new Map<string, PaneEntry>();

export const terminalContextMenuLinkStore = {
	/** Called from TerminalPane's contextmenu handler, keyed by pane id. */
	record(paneId: string, entry: PaneEntry) {
		entries.set(paneId, entry);
	},
	get(paneId: string): PaneEntry | undefined {
		return entries.get(paneId);
	},
	clear(paneId: string) {
		entries.delete(paneId);
	},
};
