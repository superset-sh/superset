import { describe, expect, it, mock } from "bun:test";
import type {
	ILinkHandler,
	ILinkProvider,
	Terminal as XTerm,
} from "@xterm/xterm";
import { TerminalLinkManager } from "./terminal-link-manager";

/**
 * Mirrors the gate in xterm's OscLinkProvider.provideLinks:
 * https://github.com/xtermjs/xterm.js/blob/master/src/browser/OscLinkProvider.ts
 *
 * When the terminal's `linkHandler` does not set `allowNonHttpProtocols`,
 * xterm drops the OSC 8 link entirely instead of building an activatable
 * ILink — so a click on the (still underlined) text is a silent no-op.
 */
function oscLinkIsDropped(uri: string, linkHandler: ILinkHandler | null) {
	if (linkHandler?.allowNonHttpProtocols) return false;
	try {
		return !["http:", "https:"].includes(new URL(uri).protocol);
	} catch {
		return true;
	}
}

function createMockTerminal() {
	const registeredProviders: ILinkProvider[] = [];
	const disposedProviders: ILinkProvider[] = [];
	const terminal = {
		options: {
			linkHandler: null,
		},
		registerLinkProvider: (provider: ILinkProvider) => {
			registeredProviders.push(provider);
			return {
				dispose: () => {
					disposedProviders.push(provider);
				},
			};
		},
		buffer: {
			active: {
				getLine: () => null,
			},
		},
		cols: 80,
	} as unknown as XTerm;

	return { terminal, registeredProviders, disposedProviders };
}

describe("TerminalLinkManager", () => {
	it("routes OSC 8 hyperlinks through the terminal URL handler", () => {
		const { terminal } = createMockTerminal();
		const manager = new TerminalLinkManager(terminal);
		const onUrlClick = mock();
		const onLinkHover = mock();
		const onLinkLeave = mock();

		manager.setHandlers({
			stat: async () => null,
			onUrlClick,
			onLinkHover,
			onLinkLeave,
		});

		const linkHandler = terminal.options.linkHandler;
		expect(linkHandler).toBeTruthy();
		expect(linkHandler?.allowNonHttpProtocols).toBe(true);

		const event = {} as MouseEvent;
		linkHandler?.activate(event, "https://example.com", {
			start: { x: 1, y: 1 },
			end: { x: 20, y: 1 },
		});
		linkHandler?.hover?.(event, "https://example.com", {
			start: { x: 1, y: 1 },
			end: { x: 20, y: 1 },
		});
		linkHandler?.leave?.(event, "https://example.com", {
			start: { x: 1, y: 1 },
			end: { x: 20, y: 1 },
		});

		expect(onUrlClick).toHaveBeenCalledWith(event, "https://example.com");
		expect(onLinkHover).toHaveBeenCalledWith(event, { kind: "url" });
		expect(onLinkLeave).toHaveBeenCalled();
	});

	it("keeps OSC 8 links with a custom scheme clickable", () => {
		const { terminal } = createMockTerminal();
		const manager = new TerminalLinkManager(terminal);
		const onUrlClick = mock();

		manager.setHandlers({ stat: async () => null, onUrlClick });

		const linkHandler = terminal.options.linkHandler ?? null;
		const uri = "cursor:///Users/me/project";

		// The regression: xterm never hands the link to us at all.
		expect(oscLinkIsDropped(uri, linkHandler)).toBe(false);

		const event = {} as MouseEvent;
		linkHandler?.activate(event, uri, {
			start: { x: 1, y: 1 },
			end: { x: 20, y: 1 },
		});
		expect(onUrlClick).toHaveBeenCalledWith(event, uri);
	});

	it("still drops OSC 8 links that use script-executing schemes", () => {
		const { terminal } = createMockTerminal();
		const manager = new TerminalLinkManager(terminal);
		const onUrlClick = mock();

		manager.setHandlers({ stat: async () => null, onUrlClick });

		const linkHandler = terminal.options.linkHandler;
		const event = {} as MouseEvent;
		const range = { start: { x: 1, y: 1 }, end: { x: 20, y: 1 } };

		for (const uri of [
			"javascript:alert(1)",
			"data:text/html,<script>alert(1)</script>",
			"vbscript:msgbox(1)",
			"file:///etc/passwd",
			"not a url",
		]) {
			linkHandler?.activate(event, uri, range);
		}

		expect(onUrlClick).not.toHaveBeenCalled();
	});

	it("clears only the OSC link handler it installed", () => {
		const { terminal, disposedProviders } = createMockTerminal();
		const manager = new TerminalLinkManager(terminal);

		manager.setHandlers({
			stat: async () => null,
			onUrlClick: mock(),
		});

		const installedHandler = terminal.options.linkHandler;
		expect(installedHandler).toBeTruthy();

		manager.dispose();

		expect(terminal.options.linkHandler).toBeNull();
		expect(disposedProviders.length).toBe(2);
	});

	it("does not clear a link handler installed by another owner", () => {
		const { terminal } = createMockTerminal();
		const manager = new TerminalLinkManager(terminal);

		manager.setHandlers({
			stat: async () => null,
			onUrlClick: mock(),
		});

		const replacementHandler = {
			activate: mock(),
		};
		terminal.options.linkHandler = replacementHandler;

		manager.dispose();

		expect(terminal.options.linkHandler).toBe(replacementHandler);
	});
});
