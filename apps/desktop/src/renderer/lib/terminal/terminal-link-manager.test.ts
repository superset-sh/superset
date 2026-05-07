import { describe, expect, it, mock } from "bun:test";
import type {
	IBufferLine,
	ILink,
	ILinkProvider,
	Terminal as XTerm,
} from "@xterm/xterm";
import { TerminalLinkManager } from "./terminal-link-manager";

function createMockTerminal(
	lines: Array<{ text: string; isWrapped?: boolean }> = [],
) {
	const registeredProviders: ILinkProvider[] = [];
	const disposedProviders: ILinkProvider[] = [];
	const mockLines: (IBufferLine | null)[] = lines.map(
		(l) =>
			({
				translateToString: () => l.text,
				isWrapped: l.isWrapped ?? false,
				length: l.text.length,
			}) as unknown as IBufferLine,
	);
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
				getLine: (index: number) => mockLines[index] ?? null,
			},
		},
		cols: 80,
	} as unknown as XTerm;

	return { terminal, registeredProviders, disposedProviders };
}

function getLinks(
	provider: ILinkProvider,
	lineNumber: number,
): Promise<ILink[]> {
	return new Promise((resolve) => {
		provider.provideLinks(lineNumber, (links) => resolve(links ?? []));
	});
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
		expect(linkHandler?.allowNonHttpProtocols).toBe(false);

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

	it("opens a URL only once when an OSC 8 hyperlink's visible text also matches the URL regex", async () => {
		// Reproduces #4168: cmd+shift+click on an OSC 8 hyperlink in the terminal
		// opens two tabs in the default browser. xterm's built-in OSC 8 provider
		// fires `terminal.options.linkHandler.activate`, and our URL link provider
		// also matches the same visible text via regex. Both wiring paths invoke
		// the same `onUrlClick`, so a single click runs `openUrl` twice.
		const url = "https://example.com";
		const { terminal, registeredProviders } = createMockTerminal([
			{ text: url },
		]);
		const manager = new TerminalLinkManager(terminal);
		const onUrlClick = mock();

		manager.setHandlers({
			stat: async () => null,
			onUrlClick,
		});

		const event = { metaKey: true, shiftKey: true } as MouseEvent;

		// Simulate xterm dispatching the same click event through both paths:
		//   1. The OSC 8 hyperlink handler (xterm's internal OscLinkProvider)
		terminal.options.linkHandler?.activate(event, url, {
			start: { x: 1, y: 1 },
			end: { x: url.length + 1, y: 1 },
		});
		//   2. Our regex-based URL link provider, which also matched the visible
		//      text "https://example.com" rendered by the OSC 8 escape.
		// registeredProviders order: [files, url, words]
		const urlProvider = registeredProviders[1];
		const urlLinks = await getLinks(urlProvider, 1);
		urlLinks[0]?.activate(event, url);

		// Bug: both paths fire `onUrlClick`, so the user sees two browser tabs.
		expect(onUrlClick).toHaveBeenCalledTimes(1);
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
