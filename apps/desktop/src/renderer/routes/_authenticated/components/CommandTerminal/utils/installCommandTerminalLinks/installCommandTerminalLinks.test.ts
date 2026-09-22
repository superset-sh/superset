import { expect, it, mock } from "bun:test";
import { Terminal as HeadlessTerminal } from "@xterm/headless";
import type { ILink, ILinkProvider, Terminal } from "@xterm/xterm";
import { installCommandTerminalLinks } from "./installCommandTerminalLinks";

it("opens wrapped login URLs with an ordinary click and disposes links", async () => {
	const buffer = new HeadlessTerminal({
		cols: 30,
		rows: 10,
		allowProposedApi: true,
	});
	const url =
		"https://example.com/oauth/authorize?state=test&redirect_uri=http%3A%2F%2Flocalhost";
	await new Promise<void>((resolve) => buffer.write(url, resolve));
	let provider: ILinkProvider | undefined;
	const dispose = mock();
	const terminal = {
		cols: buffer.cols,
		buffer: buffer.buffer,
		options: {},
		registerLinkProvider: (value: ILinkProvider) => {
			provider = value;
			return { dispose };
		},
	} as unknown as Terminal;
	const open = mock();
	const cleanup = installCommandTerminalLinks(terminal, open);
	let links: ILink[] = [];
	provider?.provideLinks(2, (value) => {
		links = value ?? [];
	});
	expect(links).toHaveLength(1);
	const event = { preventDefault: mock() } as unknown as MouseEvent;
	links[0].activate(event, links[0].text);
	expect(open).toHaveBeenCalledWith(url);
	expect(event.preventDefault).toHaveBeenCalled();
	cleanup();
	expect(dispose).toHaveBeenCalledTimes(1);
	expect(terminal.options.linkHandler).toBeUndefined();
	buffer.dispose();
});

it("opens OSC 8 web hyperlinks and rejects non-web schemes", () => {
	const previous = { activate: mock() };
	const terminal = {
		options: { linkHandler: previous },
		registerLinkProvider: () => ({ dispose() {} }),
	} as unknown as Terminal;
	const open = mock();
	const cleanup = installCommandTerminalLinks(terminal, open);
	const event = { preventDefault: mock() } as unknown as MouseEvent;
	terminal.options.linkHandler?.activate(event, "https://example.com/login", {
		start: { x: 1, y: 1 },
		end: { x: 7, y: 1 },
	});
	terminal.options.linkHandler?.activate(event, "javascript:alert(1)", {
		start: { x: 1, y: 1 },
		end: { x: 7, y: 1 },
	});
	expect(open).toHaveBeenCalledTimes(1);
	expect(open).toHaveBeenCalledWith("https://example.com/login");
	expect(terminal.options.linkHandler?.allowNonHttpProtocols).toBe(false);
	cleanup();
	expect(terminal.options.linkHandler).toBe(previous);
});
