import { describe, expect, it, mock } from "bun:test";
import { Terminal as HeadlessTerminal } from "@xterm/headless";
import type { ILink, Terminal } from "@xterm/xterm";
import fixtures from "./url-link-fixtures.json";
import { UrlLinkProvider } from "./url-link-provider";

async function setup(input: string, cols = 80) {
	const terminal = new HeadlessTerminal({
		cols,
		rows: 40,
		allowProposedApi: true,
		scrollback: 1000,
	});
	await new Promise<void>((resolve) => terminal.write(input, resolve));
	const open = mock();
	const provider = new UrlLinkProvider(terminal as unknown as Terminal, open);
	return { terminal, provider, open };
}
function linksAt(provider: UrlLinkProvider, row: number): ILink[] {
	let result: ILink[] = [];
	provider.provideLinks(row, (links) => {
		result = links ?? [];
	});
	return result;
}
function selectedText(terminal: HeadlessTerminal, link: ILink) {
	const { start, end } = link.range;
	let text = "";
	for (let y = start.y; y <= end.y; y++)
		text += terminal.buffer.active
			.getLine(y - 1)
			?.translateToString(
				true,
				y === start.y ? start.x - 1 : 0,
				y === end.y ? end.x : terminal.cols,
			);
	return text;
}

describe("upstream URL fixtures in real terminal buffers", () => {
	for (const [index, fixture] of fixtures.cases.entries()) {
		it(`${fixture.source} ${index}: ${fixture.input}`, async () => {
			const { terminal, provider } = await setup(fixture.input, 40);
			try {
				const found = new Map<string, ILink>();
				for (let y = 1; y <= terminal.buffer.active.length; y++)
					for (const link of linksAt(provider, y))
						found.set(JSON.stringify(link.range), link);
				expect([...found.values()].map((l) => l.text)).toEqual([fixture.url]);
				const link = [...found.values()][0];
				expect(selectedText(terminal, link)).toBe(fixture.url);
				for (let y = link.range.start.y; y <= link.range.end.y; y++)
					expect(
						linksAt(provider, y).map(({ text, range }) => ({ text, range })),
					).toContainEqual({ text: link.text, range: link.range });
			} finally {
				terminal.dispose();
			}
		});
	}
	for (const host of [
		"foo.com",
		...fixtures.countryTlds.flatMap((t) => [`foo${t}`, `foo.com${t}`]),
	]) {
		for (const [prefix, suffix, tail] of [
			["  ", "", "  "],
			["  ", "/a~b#c~d?e~f", "  "],
			["  ", "/colon:test", "  "],
			["  ", "/colon:test", ":  "],
			['"', "/", '"'],
			["'", "/", "'"],
			["", "/subpath/+/id", ""],
		]) {
			it(`xterm hostname ${host}: ${JSON.stringify(prefix + suffix + tail)}`, async () => {
				const url = `http://${host}${suffix}`;
				const { terminal, provider } = await setup(prefix + url + tail);
				try {
					const links = linksAt(provider, 1);
					expect(links.map((l) => l.text)).toEqual([url]);
					expect(selectedText(terminal, links[0])).toBe(url);
				} finally {
					terminal.dispose();
				}
			});
		}
	}
});

describe("URL boundary regressions", () => {
	it.each([
		"sloyd-web:dev:localhost:    ➜ Network: http://192.168.0.26:3001/",
		"  Some explanation follows",
		"README.md describes this",
		"123 tests passed",
		"/another/path",
	])("does not absorb a hard newline before %s", async (next) => {
		const { terminal, provider } = await setup(
			`sloyd-web:dev:localhost:    ➜ Local: http://localhost:3001/\r\n${next}`,
			100,
		);
		try {
			expect(
				linksAt(provider, 1).map((l) => ({ text: l.text, range: l.range })),
			).toEqual([
				{
					text: "http://localhost:3001/",
					range: { start: { x: 38, y: 1 }, end: { x: 59, y: 1 } },
				},
			]);
		} finally {
			terminal.dispose();
		}
	});
	it.each([
		"￥￥￥ ",
		"￥￥￥cafe\u0301 ",
		"😀 ",
		"",
	])("maps terminal cells after %s", async (prefix) => {
		const url = "https://ko.wikipedia.org/wiki/위키백과:대문";
		const { terminal, provider } = await setup(`${prefix + url} suffix`, 40);
		try {
			const links = linksAt(provider, 1);
			expect(links).toHaveLength(1);
			expect(links[0].text).toBe(url);
			expect(selectedText(terminal, links[0])).toBe(url);
		} finally {
			terminal.dispose();
		}
	});
	it("detects a URL across more than three rows from every row", async () => {
		const url = `https://example.com/${"a".repeat(160)}`;
		const { terminal, provider } = await setup(url, 20);
		try {
			for (let y = 1; y <= 9; y++) {
				const links = linksAt(provider, y);
				expect(links).toHaveLength(1);
				expect(links[0].text).toBe(url);
				expect(selectedText(terminal, links[0])).toBe(url);
			}
		} finally {
			terminal.dispose();
		}
	});
	it("ends at the final column, without a phantom next-row cell", async () => {
		const url = "https://example.com/";
		const { terminal, provider } = await setup(`${url} following`, 20);
		try {
			expect(linksAt(provider, 1)[0].range).toEqual({
				start: { x: 1, y: 1 },
				end: { x: 20, y: 1 },
			});
			expect(linksAt(provider, 2)).toEqual([]);
		} finally {
			terminal.dispose();
		}
	});
	it("preserves a separating space at a soft wrap", async () => {
		const { terminal, provider } = await setup(
			"https://example.com/ " + "prose",
			20,
		);
		try {
			expect(linksAt(provider, 1)[0].text).toBe("https://example.com/");
			expect(linksAt(provider, 2)).toEqual([]);
		} finally {
			terminal.dispose();
		}
	});
	it.each([
		"https://example.com/a(b(c)d)e",
		"https://example.com/a[b]",
		"http://[::1]:5000/path",
	])("trims unmatched brackets after %s", async (url) => {
		const { terminal, provider } = await setup(`(${url}).`);
		try {
			expect(linksAt(provider, 1)[0].text).toBe(url);
			expect(selectedText(terminal, linksAt(provider, 1)[0])).toBe(url);
		} finally {
			terminal.dispose();
		}
	});
	it("rejects malformed and overlong URLs", async () => {
		for (const input of [
			"http://",
			"http://:",
			"http://[invalid]/",
			`https://example.com/${"a".repeat(4096)}`,
		]) {
			const { terminal, provider } = await setup(input);
			try {
				for (let y = 1; y <= terminal.buffer.active.length; y++)
					expect(linksAt(provider, y)).toEqual([]);
			} finally {
				terminal.dispose();
			}
		}
	});
});

describe("xterm coordinate fixtures", () => {
	const cases: [string, string, number, number, number, number][] = [
		[
			"aaa http://example.com aaa http://example.com aaa",
			"http://example.com",
			5,
			1,
			22,
			1,
		],
		[
			"aaa http://example.com aaa http://example.com aaa",
			"http://example.com",
			28,
			1,
			5,
			2,
		],
		[
			"￥￥￥ http://example.com ￥￥￥ http://example.com aaa",
			"http://example.com",
			8,
			1,
			25,
			1,
		],
		[
			"￥￥￥ http://example.com ￥￥￥ http://example.com aaa",
			"http://example.com",
			34,
			1,
			11,
			2,
		],
		[
			"￥￥￥ https://ko.wikipedia.org/wiki/위키백과:대문 aaa https://ko.wikipedia.org/wiki/위키백과:대문 ￥￥￥",
			"https://ko.wikipedia.org/wiki/위키백과:대문",
			8,
			1,
			11,
			2,
		],
		[
			"￥￥￥ https://ko.wikipedia.org/wiki/위키백과:대문 aaa https://ko.wikipedia.org/wiki/위키백과:대문 ￥￥￥",
			"https://ko.wikipedia.org/wiki/위키백과:대문",
			17,
			2,
			19,
			3,
		],
		[
			"￥￥￥cafe\u0301 http://test:password@example.com/some_path",
			"http://test:password@example.com/some_path",
			12,
			1,
			13,
			2,
		],
		[
			"￥￥￥cafe\u0301 http://test:password@example.com/some_path?param=1%202%3",
			"http://test:password@example.com/some_path?param=1%202%3",
			12,
			1,
			27,
			2,
		],
	];
	for (const [input, url, sx, sy, ex, ey] of cases)
		it(`${url} at ${sx},${sy} to ${ex},${ey}`, async () => {
			const { terminal, provider } = await setup(input, 40);
			try {
				for (let y = sy; y <= ey; y++)
					expect(
						linksAt(provider, y).map(({ text, range }) => ({ text, range })),
					).toContainEqual({
						text: url,
						range: { start: { x: sx, y: sy }, end: { x: ex, y: ey } },
					});
			} finally {
				terminal.dispose();
			}
		});
});

describe("URL provider lifecycle and limits", () => {
	it("keeps hover, activation, and leave callbacks aligned with the detected URL", async () => {
		const { terminal } = await setup("https://example.com/path");
		const open = mock(),
			hover = mock(),
			leave = mock();
		const provider = new UrlLinkProvider(
			terminal as unknown as Terminal,
			open,
			hover,
			leave,
		);
		try {
			const link = linksAt(provider, 1)[0];
			const event = {} as MouseEvent;
			link.activate(event, "incorrect caller text");
			link.hover?.(event, "incorrect caller text");
			link.leave?.(event, "incorrect caller text");
			expect(open).toHaveBeenCalledWith(event, link.text);
			expect(hover).toHaveBeenCalledWith(event, link.text);
			expect(leave).toHaveBeenCalledTimes(1);
		} finally {
			terminal.dispose();
		}
	});
	it("uses fresh coordinates after resize and reflow", async () => {
		const url = `https://example.com/${"abc/".repeat(30)}`;
		const { terminal, provider } = await setup(`prefix ${url} suffix\r\n`, 40);
		try {
			for (const cols of [20, 80, 32, 100, 40]) {
				terminal.resize(cols, 40);
				const links = linksAt(provider, 1);
				expect(links[0].text).toBe(url);
				expect(selectedText(terminal, links[0])).toBe(url);
			}
		} finally {
			terminal.dispose();
		}
	});
	it("handles early wrapping of a wide character without absorbing the blank cell", async () => {
		const url = "https://example.com/界界";
		const { terminal, provider } = await setup(`${url} suffix`, 21);
		try {
			expect(linksAt(provider, 1)[0]).toMatchObject({
				text: url,
				range: { start: { x: 1, y: 1 }, end: { x: 4, y: 2 } },
			});
			expect(selectedText(terminal, linksAt(provider, 1)[0])).toBe(url);
		} finally {
			terminal.dispose();
		}
	});
	it("excludes punctuation that wraps onto the following line", async () => {
		const { terminal, provider } = await setup("https://example.com/).", 20);
		try {
			expect(linksAt(provider, 1)[0].text).toBe("https://example.com/");
			expect(linksAt(provider, 2)).toEqual([]);
		} finally {
			terminal.dispose();
		}
	});
	it("handles split schemes and percent encoding on soft wraps", async () => {
		const url = "https://example.com/a%20b?q=c%2Fd#part";
		const { terminal, provider } = await setup(" ".repeat(16) + url, 20);
		try {
			for (let y = 1; y <= 3; y++)
				expect(linksAt(provider, y)[0].text).toBe(url);
		} finally {
			terminal.dispose();
		}
	});
	it("does not infer TUI hard wraps", async () => {
		const { terminal, provider } = await setup(
			"https://github.com/org/\r\n  project/pull/123",
		);
		try {
			expect(linksAt(provider, 1)[0].text).toBe("https://github.com/org/");
			expect(linksAt(provider, 2)).toEqual([]);
		} finally {
			terminal.dispose();
		}
	});
	it.each([
		"",
		"ordinary text",
		"/tmp/file.ts",
		" ) ",
		"file:///tmp/file.ts",
	])("ignores non-web text %s", async (input) => {
		const { terminal, provider } = await setup(input);
		try {
			expect(linksAt(provider, 1)).toEqual([]);
			expect(linksAt(provider, 999)).toEqual([]);
			expect(linksAt(provider, 0)).toEqual([]);
		} finally {
			terminal.dispose();
		}
	});
	it("handles ANSI styling without extending the URL", async () => {
		const { terminal, provider } = await setup(
			"\x1b[36mhttp://localhost:\x1b[1m3001\x1b[22m/\x1b[0m\r\nnext:log:prefix",
		);
		try {
			expect(linksAt(provider, 1)[0]).toMatchObject({
				text: "http://localhost:3001/",
				range: { start: { x: 1, y: 1 }, end: { x: 22, y: 1 } },
			});
			expect(linksAt(provider, 2)).toEqual([]);
		} finally {
			terminal.dispose();
		}
	});
	it("bounds work on pathological parentheses and long wrapped output", async () => {
		for (const suffix of [
			"(".repeat(1000),
			"()".repeat(500),
			"a".repeat(100000),
		]) {
			const { terminal, provider } = await setup(
				`https://example.com/${suffix}`,
			);
			try {
				const start = performance.now();
				linksAt(provider, terminal.buffer.active.baseY + 1);
				expect(performance.now() - start).toBeLessThan(500);
			} finally {
				terminal.dispose();
			}
		}
	});
	it("accepts the maximum length and rejects one extra character", async () => {
		for (const length of [4096, 4097]) {
			const url = `https://example.com/${"a".repeat(length - 20)}`;
			const { terminal, provider } = await setup(url);
			try {
				const links = linksAt(provider, 20);
				expect(links.map((l) => l.text)).toEqual(length === 4096 ? [url] : []);
			} finally {
				terminal.dispose();
			}
		}
	});
});

it("does not truncate long wide-character URLs at the context boundary", async () => {
	const url = `https://example.com/${"界".repeat(3000)}`;
	const { terminal, provider } = await setup(url, 80);
	try {
		for (const row of [1, 30, 60, 75])
			expect(linksAt(provider, row).map((l) => l.text)).toEqual([url]);
	} finally {
		terminal.dispose();
	}
});

for (const delimiter of ["|", "<", '"']) {
	for (const cols of [30, 120]) {
		it(`resets bracket context after ${delimiter} with ${cols} columns`, async () => {
			const url = "https://second.example/path";
			const { terminal, provider } = await setup(
				`https://first.example/[unfinished${delimiter} ${url} trailing prose`,
				cols,
			);
			try {
				const found = new Map<string, ILink>();
				for (let row = 1; row <= terminal.buffer.active.length; row++) {
					for (const link of linksAt(provider, row))
						found.set(JSON.stringify(link.range), link);
				}
				const links = [...found.values()];
				expect(links.map((link) => link.text)).toEqual([
					"https://first.example/[unfinished",
					url,
				]);
				for (const link of links)
					expect(selectedText(terminal, link)).toBe(link.text);
			} finally {
				terminal.dispose();
			}
		});
	}
}
