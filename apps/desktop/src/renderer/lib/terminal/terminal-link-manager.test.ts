import { describe, expect, it, mock } from "bun:test";
import type { ILinkProvider, Terminal as XTerm } from "@xterm/xterm";
import { TerminalLinkManager } from "./terminal-link-manager";

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

	it("routes OSC 8 file:// hyperlinks through the file handler", () => {
		const { terminal } = createMockTerminal();
		const manager = new TerminalLinkManager(terminal);
		const onFileUrlClick = mock();
		const onUrlClick = mock();
		const onLinkHover = mock();

		manager.setHandlers({
			stat: async () => null,
			onFileUrlClick,
			onUrlClick,
			onLinkHover,
		});

		const linkHandler = terminal.options.linkHandler;
		const event = {} as MouseEvent;
		const range = { start: { x: 1, y: 1 }, end: { x: 20, y: 1 } };
		const uri = "file:///Users/me/.claude/image-cache/a%20b.png";

		linkHandler?.activate(event, uri, range);
		linkHandler?.hover?.(event, uri, range);

		expect(onFileUrlClick).toHaveBeenCalledWith(
			event,
			"/Users/me/.claude/image-cache/a b.png",
		);
		expect(onUrlClick).not.toHaveBeenCalled();
		expect(onLinkHover).toHaveBeenCalledWith(event, {
			kind: "file",
			isDirectory: false,
		});
	});

	it("ignores OSC 8 hyperlinks using an unsupported scheme", () => {
		const { terminal } = createMockTerminal();
		const manager = new TerminalLinkManager(terminal);
		const onFileUrlClick = mock();
		const onUrlClick = mock();
		const onLinkHover = mock();

		manager.setHandlers({
			stat: async () => null,
			onFileUrlClick,
			onUrlClick,
			onLinkHover,
		});

		const linkHandler = terminal.options.linkHandler;
		const event = {} as MouseEvent;
		const range = { start: { x: 1, y: 1 }, end: { x: 20, y: 1 } };

		linkHandler?.activate(event, "javascript:alert(1)", range);
		linkHandler?.hover?.(event, "javascript:alert(1)", range);

		expect(onFileUrlClick).not.toHaveBeenCalled();
		expect(onUrlClick).not.toHaveBeenCalled();
		expect(onLinkHover).not.toHaveBeenCalled();
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
