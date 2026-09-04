import { describe, expect, it, mock } from "bun:test";
import type { ILinkProvider, Terminal as XTerm } from "@xterm/xterm";
import { TerminalLinkManager } from "./terminal-link-manager";

function createMockTerminal() {
	const registeredProviders: ILinkProvider[] = [];
	const disposedProviders: ILinkProvider[] = [];
	const selectionState = { hasSelection: false };
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
		hasSelection: () => selectionState.hasSelection,
	} as unknown as XTerm;

	return { terminal, registeredProviders, disposedProviders, selectionState };
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
		expect(onLinkHover).toHaveBeenCalledWith(event, {
			kind: "url",
			url: "https://example.com",
		});
		expect(onLinkLeave).toHaveBeenCalled();
	});

	it("skips plain-click activation while text is selected, but not modifier clicks", () => {
		const { terminal, selectionState } = createMockTerminal();
		const manager = new TerminalLinkManager(terminal);
		const onUrlClick = mock();

		manager.setHandlers({
			stat: async () => null,
			onUrlClick,
		});

		const linkHandler = terminal.options.linkHandler;
		const range = { start: { x: 1, y: 1 }, end: { x: 20, y: 1 } };

		// Tail of a double-click word-select / intra-link drag: suppressed.
		selectionState.hasSelection = true;
		linkHandler?.activate({} as MouseEvent, "https://example.com", range);
		expect(onUrlClick).not.toHaveBeenCalled();

		// Shift-click extends the selection as a side effect but must still
		// activate, else the shift binding would be unreachable.
		linkHandler?.activate(
			{ shiftKey: true } as MouseEvent,
			"https://example.com",
			range,
		);
		expect(onUrlClick).toHaveBeenCalledTimes(1);

		// Plain click without a selection activates.
		selectionState.hasSelection = false;
		linkHandler?.activate({} as MouseEvent, "https://example.com", range);
		expect(onUrlClick).toHaveBeenCalledTimes(2);
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
