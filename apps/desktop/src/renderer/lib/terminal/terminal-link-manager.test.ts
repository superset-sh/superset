import { describe, expect, it, mock } from "bun:test";
import type { ILinkProvider, Terminal as XTerm } from "@xterm/xterm";
import {
	type TerminalLinkHandlers,
	TerminalLinkManager,
} from "./terminal-link-manager";

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

function createMockTerminalWithScreen() {
	const mock_ = createMockTerminal();
	const listeners = new Set<(event: MouseEvent) => void>();
	const screenElement = {
		addEventListener: (_type: string, listener: (event: MouseEvent) => void) =>
			listeners.add(listener),
		removeEventListener: (
			_type: string,
			listener: (event: MouseEvent) => void,
		) => listeners.delete(listener),
	};
	const focus = mock();
	Object.assign(mock_.terminal, {
		element: {
			querySelector: (selector: string) =>
				selector === ".xterm-screen" ? screenElement : null,
		},
		focus,
	});
	const mouseDown = (init: Partial<MouseEvent>) => {
		const event = {
			button: 0,
			shiftKey: false,
			metaKey: false,
			ctrlKey: false,
			stopPropagation: mock(),
			preventDefault: mock(),
			...init,
		} as unknown as MouseEvent;
		for (const listener of listeners) listener(event);
		return event;
	};
	return { ...mock_, listeners, focus, mouseDown };
}

const linkRange = { start: { x: 1, y: 1 }, end: { x: 20, y: 1 } };

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

	describe("Shift+click on a link", () => {
		function setup(
			isLinkActivation: TerminalLinkHandlers["isLinkActivation"] = (event) =>
				event.metaKey,
		) {
			const ctx = createMockTerminalWithScreen();
			const manager = new TerminalLinkManager(ctx.terminal);
			manager.setHandlers({
				stat: async () => null,
				onUrlClick: mock(),
				isLinkActivation,
			});
			const hoverUrl = () =>
				ctx.terminal.options.linkHandler?.hover?.(
					{} as MouseEvent,
					"https://example.com",
					linkRange,
				);
			const leaveUrl = () =>
				ctx.terminal.options.linkHandler?.leave?.(
					{} as MouseEvent,
					"https://example.com",
					linkRange,
				);
			return { ...ctx, manager, hoverUrl, leaveUrl };
		}

		it("keeps the mousedown from reaching xterm's selection when it opens the link", () => {
			const isLinkActivation = mock((event: MouseEvent) => event.metaKey);
			const { hoverUrl, mouseDown, focus } = setup(isLinkActivation);
			hoverUrl();

			const event = mouseDown({ shiftKey: true, metaKey: true });

			expect(isLinkActivation).toHaveBeenCalledWith(event, {
				kind: "url",
				url: "https://example.com",
			});
			expect(event.stopPropagation).toHaveBeenCalled();
			expect(event.preventDefault).toHaveBeenCalled();
			expect(focus).toHaveBeenCalled();
		});

		it("leaves Shift+click alone when the modifiers don't open the link", () => {
			const { hoverUrl, mouseDown } = setup();
			hoverUrl();

			const event = mouseDown({ shiftKey: true });

			expect(event.stopPropagation).not.toHaveBeenCalled();
		});

		it("leaves Shift+click alone when no link is hovered", () => {
			const { hoverUrl, leaveUrl, mouseDown } = setup();

			expect(
				mouseDown({ shiftKey: true, metaKey: true }).stopPropagation,
			).not.toHaveBeenCalled();

			hoverUrl();
			leaveUrl();

			expect(
				mouseDown({ shiftKey: true, metaKey: true }).stopPropagation,
			).not.toHaveBeenCalled();
		});

		it("leaves clicks without Shift alone", () => {
			const { hoverUrl, mouseDown } = setup();
			hoverUrl();

			const event = mouseDown({ metaKey: true });

			expect(event.stopPropagation).not.toHaveBeenCalled();
		});

		it("listens once across re-registrations and stops on dispose", () => {
			const { manager, listeners } = setup();
			manager.setHandlers({ stat: async () => null, onUrlClick: mock() });

			expect(listeners.size).toBe(1);

			manager.dispose();

			expect(listeners.size).toBe(0);
		});
	});
});
