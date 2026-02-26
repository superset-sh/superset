import { describe, expect, it, mock } from "bun:test";
import type { IBufferLine, ILink, Terminal } from "@xterm/xterm";
import { UrlLinkProvider } from "./url-link-provider";

function createMockLine(text: string, isWrapped = false): IBufferLine {
	return {
		translateToString: () => text,
		isWrapped,
		length: text.length,
		getCell: mock(() => null),
		getCells: mock(() => []),
	} as unknown as IBufferLine;
}

function createMockTerminal(
	lines: Array<{ text: string; isWrapped?: boolean }>,
	cols = 80,
): Terminal {
	const mockLines = lines.map((l) =>
		createMockLine(l.text, l.isWrapped ?? false),
	);

	return {
		buffer: {
			active: {
				getLine: (index: number) => mockLines[index] ?? null,
			},
		},
		element: {
			style: { cursor: "" },
		},
		cols,
	} as unknown as Terminal;
}

function getLinks(
	provider: UrlLinkProvider,
	lineNumber: number,
): Promise<ILink[]> {
	return new Promise((resolve) => {
		provider.provideLinks(lineNumber, (links) => {
			resolve(links ?? []);
		});
	});
}

describe("UrlLinkProvider", () => {
	describe("basic URL detection", () => {
		it("should detect https URLs", async () => {
			const terminal = createMockTerminal([
				{ text: "Visit https://example.com/path" },
			]);
			const onOpen = mock();
			const provider = new UrlLinkProvider(terminal, onOpen);

			const links = await getLinks(provider, 1);

			expect(links.length).toBe(1);
			expect(links[0].text).toBe("https://example.com/path");
		});

		it("should detect http URLs", async () => {
			const terminal = createMockTerminal([
				{ text: "Visit http://example.com/path" },
			]);
			const onOpen = mock();
			const provider = new UrlLinkProvider(terminal, onOpen);

			const links = await getLinks(provider, 1);

			expect(links.length).toBe(1);
			expect(links[0].text).toBe("http://example.com/path");
		});

		it("should detect URLs with query parameters", async () => {
			const terminal = createMockTerminal([
				{ text: "https://example.com/path?foo=bar&baz=qux" },
			]);
			const onOpen = mock();
			const provider = new UrlLinkProvider(terminal, onOpen);

			const links = await getLinks(provider, 1);

			expect(links.length).toBe(1);
			expect(links[0].text).toBe("https://example.com/path?foo=bar&baz=qux");
		});

		it("should detect URLs with fragments", async () => {
			const terminal = createMockTerminal([
				{ text: "https://example.com/path#section" },
			]);
			const onOpen = mock();
			const provider = new UrlLinkProvider(terminal, onOpen);

			const links = await getLinks(provider, 1);

			expect(links.length).toBe(1);
			expect(links[0].text).toBe("https://example.com/path#section");
		});

		it("should detect multiple URLs on one line", async () => {
			const terminal = createMockTerminal([
				{ text: "https://a.com and https://b.com" },
			]);
			const onOpen = mock();
			const provider = new UrlLinkProvider(terminal, onOpen);

			const links = await getLinks(provider, 1);

			expect(links.length).toBe(2);
			expect(links[0].text).toBe("https://a.com");
			expect(links[1].text).toBe("https://b.com");
		});

		it("should detect URLs with port numbers", async () => {
			const terminal = createMockTerminal([
				{ text: "Server at http://localhost:3000/api" },
			]);
			const onOpen = mock();
			const provider = new UrlLinkProvider(terminal, onOpen);

			const links = await getLinks(provider, 1);

			expect(links.length).toBe(1);
			expect(links[0].text).toBe("http://localhost:3000/api");
		});

		it("should handle URLs with parentheses (like Wikipedia)", async () => {
			const terminal = createMockTerminal([
				{ text: "https://en.wikipedia.org/wiki/URL_(disambiguation)" },
			]);
			const onOpen = mock();
			const provider = new UrlLinkProvider(terminal, onOpen);

			const links = await getLinks(provider, 1);

			expect(links.length).toBe(1);
			expect(links[0].text).toBe(
				"https://en.wikipedia.org/wiki/URL_(disambiguation)",
			);
		});

		it("should strip trailing period from URL", async () => {
			const terminal = createMockTerminal([
				{ text: "See https://example.com." },
			]);
			const onOpen = mock();
			const provider = new UrlLinkProvider(terminal, onOpen);

			const links = await getLinks(provider, 1);

			expect(links.length).toBe(1);
			expect(links[0].text).toBe("https://example.com");
		});

		it("should strip trailing comma from URL", async () => {
			const terminal = createMockTerminal([
				{ text: "Visit https://example.com, then continue." },
			]);
			const onOpen = mock();
			const provider = new UrlLinkProvider(terminal, onOpen);

			const links = await getLinks(provider, 1);

			expect(links.length).toBe(1);
			expect(links[0].text).toBe("https://example.com");
		});

		it("should strip multiple trailing punctuation", async () => {
			const terminal = createMockTerminal([
				{ text: "Check https://example.com..." },
			]);
			const onOpen = mock();
			const provider = new UrlLinkProvider(terminal, onOpen);

			const links = await getLinks(provider, 1);

			expect(links.length).toBe(1);
			expect(links[0].text).toBe("https://example.com");
		});

		it("should strip trailing exclamation and question marks", async () => {
			const terminal = createMockTerminal([
				{ text: "Is it https://example.com?" },
			]);
			const onOpen = mock();
			const provider = new UrlLinkProvider(terminal, onOpen);

			const links = await getLinks(provider, 1);

			expect(links.length).toBe(1);
			expect(links[0].text).toBe("https://example.com");
		});

		it("should trim unbalanced trailing parenthesis", async () => {
			const terminal = createMockTerminal([
				{ text: "(see https://example.com)" },
			]);
			const onOpen = mock();
			const provider = new UrlLinkProvider(terminal, onOpen);

			const links = await getLinks(provider, 1);

			expect(links.length).toBe(1);
			expect(links[0].text).toBe("https://example.com");
		});

		it("should keep balanced parentheses in URL", async () => {
			const terminal = createMockTerminal([
				{ text: "https://example.com/path(foo)" },
			]);
			const onOpen = mock();
			const provider = new UrlLinkProvider(terminal, onOpen);

			const links = await getLinks(provider, 1);

			expect(links.length).toBe(1);
			expect(links[0].text).toBe("https://example.com/path(foo)");
		});

		it("should handle URL in parentheses with balanced parens inside", async () => {
			const terminal = createMockTerminal([
				{ text: "(see https://en.wikipedia.org/wiki/URL_(disambiguation))" },
			]);
			const onOpen = mock();
			const provider = new UrlLinkProvider(terminal, onOpen);

			const links = await getLinks(provider, 1);

			expect(links.length).toBe(1);
			expect(links[0].text).toBe(
				"https://en.wikipedia.org/wiki/URL_(disambiguation)",
			);
		});
	});

	describe("wrapped lines - forward looking (next line)", () => {
		it("should detect URL that spans current line and wrapped next line", async () => {
			const terminal = createMockTerminal([
				{ text: "https://example.com/ver" },
				{ text: "y/long/path/here", isWrapped: true },
			]);
			const onOpen = mock();
			const provider = new UrlLinkProvider(terminal, onOpen);

			const links = await getLinks(provider, 1);

			expect(links.length).toBe(1);
			expect(links[0].text).toBe("https://example.com/very/long/path/here");
			expect(links[0].range.start.y).toBe(1);
			expect(links[0].range.end.y).toBe(2);
		});

		it("should calculate correct range for multi-line URL starting on current line", async () => {
			const terminal = createMockTerminal([
				{ text: "https://example.com/ver" },
				{ text: "y/long/path/here", isWrapped: true },
			]);
			const onOpen = mock();
			const provider = new UrlLinkProvider(terminal, onOpen);

			const links = await getLinks(provider, 1);

			expect(links[0].range.start.y).toBe(1);
			expect(links[0].range.end.y).toBe(2);
		});
	});

	describe("wrapped lines - backward looking (previous line)", () => {
		it("should detect URL from previous line when current line is wrapped", async () => {
			const terminal = createMockTerminal([
				{ text: "https://example.com/ver" },
				{ text: "y/long/path/here", isWrapped: true },
			]);
			const onOpen = mock();
			const provider = new UrlLinkProvider(terminal, onOpen);

			const links = await getLinks(provider, 2);

			expect(links.length).toBe(1);
			expect(links[0].text).toBe("https://example.com/very/long/path/here");
			expect(links[0].range.start.y).toBe(1);
			expect(links[0].range.end.y).toBe(2);
		});

		it("should handle clicking on wrapped portion of URL", async () => {
			const terminal = createMockTerminal([
				{ text: "Visit https://github.com/" },
				{ text: "anthropics/claude-code/issues", isWrapped: true },
			]);
			const onOpen = mock();
			const provider = new UrlLinkProvider(terminal, onOpen);

			const links = await getLinks(provider, 2);

			expect(links.length).toBe(1);
			expect(links[0].text).toBe(
				"https://github.com/anthropics/claude-code/issues",
			);
		});
	});

	describe("three-line wrapping", () => {
		it("should handle URL spanning three lines when scanned from middle", async () => {
			const terminal = createMockTerminal([
				{ text: "https://exa" },
				{ text: "mple.com/ve", isWrapped: true },
				{ text: "ry/long/url", isWrapped: true },
			]);
			const onOpen = mock();
			const provider = new UrlLinkProvider(terminal, onOpen);

			const links = await getLinks(provider, 2);

			expect(links.length).toBe(1);
			expect(links[0].text).toBe("https://example.com/very/long/url");
		});
	});

	describe("non-wrapped lines", () => {
		it("should not combine lines that are not wrapped", async () => {
			const terminal = createMockTerminal([
				{ text: "https://a.com" },
				{ text: "https://b.com", isWrapped: false },
			]);
			const onOpen = mock();
			const provider = new UrlLinkProvider(terminal, onOpen);

			const links = await getLinks(provider, 1);

			expect(links.length).toBe(1);
			expect(links[0].text).toBe("https://a.com");
		});

		it("should handle URLs on separate lines independently", async () => {
			const terminal = createMockTerminal([
				{ text: "https://a.com" },
				{ text: "https://b.com", isWrapped: false },
			]);
			const onOpen = mock();
			const provider = new UrlLinkProvider(terminal, onOpen);

			const links1 = await getLinks(provider, 1);
			const links2 = await getLinks(provider, 2);

			expect(links1.length).toBe(1);
			expect(links1[0].text).toBe("https://a.com");
			expect(links2.length).toBe(1);
			expect(links2[0].text).toBe("https://b.com");
		});
	});

	describe("hard-wrapped TUI lines", () => {
		it("should detect URL split across adjacent non-wrapped lines", async () => {
			const terminal = createMockTerminal(
				[
					{
						text: "Draft PR created: https://github.com/palette-performance/pa",
					},
					{ text: "lette-monorepo/pull/883" },
				],
				60,
			);
			const onOpen = mock();
			const provider = new UrlLinkProvider(terminal, onOpen);

			const links = await getLinks(provider, 1);

			expect(links.length).toBe(1);
			expect(links[0].text).toBe(
				"https://github.com/palette-performance/palette-monorepo/pull/883",
			);
			expect(links[0].range.start.y).toBe(1);
			expect(links[0].range.end.y).toBe(2);
		});

		it("should preserve UTF-8 continuation when next line starts with hyphen digit", async () => {
			const terminal = createMockTerminal(
				[
					{
						text: "- https://www.google.com/search?q=testing+long+urls+for+development+purposes&oq=testing+long+urls+for+development+purposes&sourceid=chrome&ie=UTF",
					},
					{ text: "  -8&num=100&start=0&safe=active&filter=0" },
				],
				150,
			);
			const onOpen = mock();
			const provider = new UrlLinkProvider(terminal, onOpen);

			const links = await getLinks(provider, 1);
			expect(links.length).toBe(1);
			expect(links[0].text).toBe(
				"https://www.google.com/search?q=testing+long+urls+for+development+purposes&oq=testing+long+urls+for+development+purposes&sourceid=chrome&ie=UTF-8&num=100&start=0&safe=active&filter=0",
			);
		});

		it("should detect URL when scanning the continuation line", async () => {
			const terminal = createMockTerminal(
				[
					{
						text: "Draft PR created: https://github.com/palette-performance/pa",
					},
					{ text: "lette-monorepo/pull/883" },
				],
				60,
			);
			const onOpen = mock();
			const provider = new UrlLinkProvider(terminal, onOpen);

			const links = await getLinks(provider, 2);

			expect(links.length).toBe(1);
			expect(links[0].text).toBe(
				"https://github.com/palette-performance/palette-monorepo/pull/883",
			);
			expect(links[0].range.start.y).toBe(1);
			expect(links[0].range.end.y).toBe(2);
		});

		it("should not merge plain prose after a complete URL", async () => {
			const terminal = createMockTerminal(
				[
					{ text: "Open https://example.com/docs/reference" },
					{ text: "for details" },
				],
				40,
			);
			const onOpen = mock();
			const provider = new UrlLinkProvider(terminal, onOpen);

			const linksFromFirstLine = await getLinks(provider, 1);
			const linksFromSecondLine = await getLinks(provider, 2);

			expect(linksFromFirstLine.length).toBe(1);
			expect(linksFromFirstLine[0].text).toBe(
				"https://example.com/docs/reference",
			);
			expect(linksFromSecondLine.length).toBe(0);
		});

		it("should not merge into following list-item URL continuations", async () => {
			const terminal = createMockTerminal(
				[
					{
						text: "https://www.google.com/search?q=testing+long+urls+for+development+pur",
					},
					{
						text: "  poses&oq=testing+long+urls+for+development+purposes&sourceid=chrome&ie=",
					},
					{ text: "  UTF-8&num=100&start=0&safe=active&filter=0" },
					{
						text: " - https://jsonplaceholder.typicode.com/comments?postId=1&sort=id&_orde",
					},
					{
						text: "  r=desc&_start=0&_end=10&_limit=10&_page=1&_embed=post&_expand=user",
					},
					{
						text: " - https://httpbin.org/anything/path/to/some/deeply/nested/resource/that",
					},
					{
						text: "  /keeps/going/and/going/until/it/becomes/quite/long?param1=value1",
					},
				],
				85,
			);
			const onOpen = mock();
			const provider = new UrlLinkProvider(terminal, onOpen);

			const firstLinks = await getLinks(provider, 1);
			const firstLinksFromLastLine = await getLinks(provider, 3);

			const expectedFirstUrl =
				"https://www.google.com/search?q=testing+long+urls+for+development+purposes&oq=testing+long+urls+for+development+purposes&sourceid=chrome&ie=UTF-8&num=100&start=0&safe=active&filter=0";
			expect(firstLinks.length).toBe(1);
			expect(firstLinks[0].text).toBe(expectedFirstUrl);
			expect(firstLinksFromLastLine.length).toBe(1);
			expect(firstLinksFromLastLine[0].text).toBe(expectedFirstUrl);
		});
	});

	describe("hardening - transcript fixtures", () => {
		it("should keep transcript URLs isolated with consistent hover range and activation", async () => {
			const terminal = createMockTerminal(
				[
					{
						text: "https://www.google.com/search?q=testing+long+urls+for+development+pur",
					},
					{
						text: "  poses&oq=testing+long+urls+for+development+purposes&sourceid=chrome&ie=",
					},
					{ text: "  UTF-8&num=100&start=0&safe=active&filter=0" },
					{
						text: " - https://jsonplaceholder.typicode.com/comments?postId=1&sort=id&_orde",
					},
					{
						text: "  r=desc&_start=0&_end=10&_limit=10&_page=1&_embed=post&_expand=user",
					},
					{
						text: " - https://httpbin.org/anything/path/to/some/deeply/nested/resource/that",
					},
					{
						text: "  /keeps/going/and/going/until/it/becomes/quite/long?param1=value1",
					},
				],
				85,
			);
			const onOpen = mock();
			const provider = new UrlLinkProvider(terminal, onOpen);

			const firstLinks = await getLinks(provider, 1);
			const firstLinksTail = await getLinks(provider, 3);
			const secondLinks = await getLinks(provider, 4);

			const expectedFirstUrl =
				"https://www.google.com/search?q=testing+long+urls+for+development+purposes&oq=testing+long+urls+for+development+purposes&sourceid=chrome&ie=UTF-8&num=100&start=0&safe=active&filter=0";
			expect(firstLinks.length).toBe(1);
			expect(firstLinks[0].text).toBe(expectedFirstUrl);
			expect(firstLinks[0].range.start.y).toBe(1);
			expect(firstLinks[0].range.end.y).toBe(3);

			expect(firstLinksTail.length).toBe(1);
			expect(firstLinksTail[0].text).toBe(expectedFirstUrl);
			expect(firstLinksTail[0].range.start.y).toBe(1);
			expect(firstLinksTail[0].range.end.y).toBe(3);

			expect(secondLinks.length).toBe(1);
			expect(secondLinks[0].text).toContain(
				"https://jsonplaceholder.typicode.com/comments?",
			);
			expect(secondLinks[0].text).not.toContain("httpbin.org");

			const event = {
				metaKey: true,
				ctrlKey: false,
				preventDefault: mock(),
			} as unknown as MouseEvent;
			firstLinksTail[0].activate(event, firstLinksTail[0].text);
			expect(onOpen).toHaveBeenCalledTimes(1);
			expect(onOpen.mock.calls[0][1]).toBe(expectedFirstUrl);
		});

		it("should block continuation across prompt and table boundary lines", async () => {
			const terminal = createMockTerminal(
				[
					{
						text: "https://example.com/api/v1/resource/that/is/really/really/long?token=abc",
					},
					{ text: "  123&scope=dev&region=us-east-1" },
					{ text: "$ next command output" },
					{
						text: "│ https://other.example.com/path/that/should/stay/separate?flag=1",
					},
					{ text: "│   &page=2" },
				],
				88,
			);
			const onOpen = mock();
			const provider = new UrlLinkProvider(terminal, onOpen);

			const firstUrlLinks = await getLinks(provider, 1);
			const secondUrlLinks = await getLinks(provider, 4);

			expect(firstUrlLinks.length).toBe(1);
			expect(firstUrlLinks[0].text).toBe(
				"https://example.com/api/v1/resource/that/is/really/really/long?token=abc123&scope=dev&region=us-east-1",
			);
			expect(firstUrlLinks[0].text).not.toContain("other.example.com");

			expect(secondUrlLinks.length).toBe(1);
			expect(secondUrlLinks[0].text).toContain("https://other.example.com/");
		});

		it("should preserve split percent-encoding segments", async () => {
			const terminal = createMockTerminal(
				[
					{
						text: "https://example.com/redirect?target=https%3A%2F%2Fapi.example.com%2",
					},
					{ text: "  Fcallback%3Ffrom%3Dterminal%26state%3Dok&mode=test" },
				],
				78,
			);
			const onOpen = mock();
			const provider = new UrlLinkProvider(terminal, onOpen);

			const links = await getLinks(provider, 1);
			expect(links.length).toBe(1);
			expect(links[0].text).toBe(
				"https://example.com/redirect?target=https%3A%2F%2Fapi.example.com%2Fcallback%3Ffrom%3Dterminal%26state%3Dok&mode=test",
			);
		});

		it("should merge split scheme boundary https + ://", async () => {
			const terminal = createMockTerminal(
				[
					{ text: "Open https" },
					{ text: "  ://example.com/path/to/resource?x=1&y=2" },
				],
				40,
			);
			const onOpen = mock();
			const provider = new UrlLinkProvider(terminal, onOpen);

			const links = await getLinks(provider, 1);
			expect(links.length).toBe(1);
			expect(links[0].text).toBe(
				"https://example.com/path/to/resource?x=1&y=2",
			);
		});

		it("should not merge hyphen-number prose after URL", async () => {
			const terminal = createMockTerminal(
				[
					{ text: "https://example.com/path/to/doc" },
					{ text: "  -8 reasons to prefer readability" },
				],
				48,
			);
			const onOpen = mock();
			const provider = new UrlLinkProvider(terminal, onOpen);

			const linksOnFirstLine = await getLinks(provider, 1);
			const linksOnSecondLine = await getLinks(provider, 2);
			expect(linksOnFirstLine.length).toBe(1);
			expect(linksOnFirstLine[0].text).toBe("https://example.com/path/to/doc");
			expect(linksOnSecondLine.length).toBe(0);
		});

		it("should trim punctuation and bracket suffix after wrapped URL", async () => {
			const terminal = createMockTerminal(
				[
					{ text: "(ref https://example.com/a/very/long/path/that/keeps/goin" },
					{ text: "  g?alpha=1&beta=2)." },
				],
				70,
			);
			const onOpen = mock();
			const provider = new UrlLinkProvider(terminal, onOpen);

			const links = await getLinks(provider, 1);
			expect(links.length).toBe(1);
			expect(links[0].text).toBe(
				"https://example.com/a/very/long/path/that/keeps/going?alpha=1&beta=2",
			);
		});

		it("should remain stable across different wrap layouts (reflow-like)", async () => {
			const fullUrl =
				"https://example.com/path/to/same/link?one=1&two=2&three=3&four=4&five=5";
			const splitA = createMockTerminal(
				[
					{ text: "https://example.com/path/to/same/link?one=1&two=2&th" },
					{ text: "  ree=3&four=4&five=5" },
				],
				62,
			);
			const splitB = createMockTerminal(
				[
					{ text: "https://example.com/path/to/same/l" },
					{ text: "  ink?one=1&two=2&three=3&four=4" },
					{ text: "  &five=5" },
				],
				38,
			);
			const providerA = new UrlLinkProvider(splitA, mock());
			const providerB = new UrlLinkProvider(splitB, mock());

			const linksA = await getLinks(providerA, 1);
			const linksB = await getLinks(providerB, 2);

			expect(linksA.length).toBe(1);
			expect(linksA[0].text).toBe(fullUrl);
			expect(linksB.length).toBe(1);
			expect(linksB[0].text).toBe(fullUrl);
		});
	});

	describe("hardening - deterministic fuzz", () => {
		function createRng(seed: number): () => number {
			let state = seed >>> 0;
			return () => {
				state = (state * 1664525 + 1013904223) >>> 0;
				return state / 0x100000000;
			};
		}

		function chunkText(input: string, rng: () => number): string[] {
			const chunks: string[] = [];
			let index = 0;
			while (index < input.length) {
				const len = 14 + Math.floor(rng() * 24);
				chunks.push(input.slice(index, index + len));
				index += len;
			}
			return chunks;
		}

		it("should keep adjacent wrapped URL groups isolated under varied separators", async () => {
			for (let seed = 1; seed <= 40; seed++) {
				const rng = createRng(seed);

				const firstUrl =
					`https://example.com/a/${seed}/deep/path/with/query?` +
					`alpha=${Math.floor(rng() * 1e6)}&beta=${Math.floor(rng() * 1e6)}`;
				const secondUrl =
					`https://api.example.net/b/${seed}/long/resource?` +
					`cursor=${Math.floor(rng() * 1e6)}&limit=50&sort=desc`;

				const firstChunks = chunkText(firstUrl, rng);
				const secondChunks = chunkText(secondUrl, rng);

				const separators = [
					"- item boundary",
					"> prompt boundary",
					"$ shell boundary",
					"│ table boundary",
				];
				const separator =
					separators[Math.floor(rng() * separators.length)] ?? separators[0];

				const firstLines = firstChunks.map((text, index) => ({
					text: index === 0 ? text : `  ${text}`,
				}));
				const secondLines = secondChunks.map((text, index) => ({
					text: index === 0 ? `- ${text}` : `  ${text}`,
				}));

				const terminal = createMockTerminal(
					[...firstLines, { text: separator }, ...secondLines],
					72,
				);
				const onOpen = mock();
				const provider = new UrlLinkProvider(terminal, onOpen);

				const firstStartLinks = await getLinks(provider, 1);
				const firstTailLinks = await getLinks(provider, firstLines.length);
				const secondStartLine = firstLines.length + 2;
				const secondStartLinks = await getLinks(provider, secondStartLine);
				const secondTailLinks = await getLinks(
					provider,
					secondStartLine + secondLines.length - 1,
				);

				expect(firstStartLinks.length).toBe(1);
				expect(firstStartLinks[0].text).toBe(firstUrl);
				expect(firstStartLinks[0].range.start.y).toBe(1);
				expect(firstStartLinks[0].range.end.y).toBe(firstLines.length);

				expect(firstTailLinks.length).toBe(1);
				expect(firstTailLinks[0].text).toBe(firstUrl);
				expect(firstTailLinks[0].text).not.toContain("api.example.net");

				expect(secondStartLinks.length).toBe(1);
				expect(secondStartLinks[0].text).toBe(secondUrl);
				expect(secondTailLinks.length).toBe(1);
				expect(secondTailLinks[0].text).toBe(secondUrl);
				expect(secondTailLinks[0].text).not.toContain("example.com/a/");
			}
		});
	});

	describe("handleActivation", () => {
		it("should require metaKey (Cmd) or ctrlKey for activation", async () => {
			const terminal = createMockTerminal([{ text: "https://example.com" }]);
			const onOpen = mock();
			const provider = new UrlLinkProvider(terminal, onOpen);

			const links = await getLinks(provider, 1);
			const mockEvent = {
				metaKey: false,
				ctrlKey: false,
				preventDefault: mock(),
			} as unknown as MouseEvent;

			links[0].activate(mockEvent, "https://example.com");

			expect(onOpen).not.toHaveBeenCalled();
		});

		it("should activate with metaKey (Cmd)", async () => {
			const terminal = createMockTerminal([{ text: "https://example.com" }]);
			const onOpen = mock();
			const provider = new UrlLinkProvider(terminal, onOpen);

			const links = await getLinks(provider, 1);
			const mockEvent = {
				metaKey: true,
				ctrlKey: false,
				preventDefault: mock(),
			} as unknown as MouseEvent;

			links[0].activate(mockEvent, "https://example.com");

			expect(onOpen).toHaveBeenCalled();
			expect(onOpen.mock.calls[0][1]).toBe("https://example.com");
		});

		it("should activate with ctrlKey", async () => {
			const terminal = createMockTerminal([{ text: "https://example.com" }]);
			const onOpen = mock();
			const provider = new UrlLinkProvider(terminal, onOpen);

			const links = await getLinks(provider, 1);
			const mockEvent = {
				metaKey: false,
				ctrlKey: true,
				preventDefault: mock(),
			} as unknown as MouseEvent;

			links[0].activate(mockEvent, "https://example.com");

			expect(onOpen).toHaveBeenCalled();
		});
	});

	describe("ReDoS prevention", () => {
		it("should handle pathological input without hanging", async () => {
			// This input would cause catastrophic backtracking with nested quantifiers
			// Old pattern: (?:[^\s<>[\]()'"]+|\([^\s<>[\]()'"]*\))+
			const maliciousInput = `https://${"a".repeat(100)}(`;
			const terminal = createMockTerminal([{ text: maliciousInput }]);
			const onOpen = mock();
			const provider = new UrlLinkProvider(terminal, onOpen);

			const start = performance.now();
			const links = await getLinks(provider, 1);
			const elapsed = performance.now() - start;

			// Should complete in under 100ms (old pattern would take seconds/minutes)
			expect(elapsed).toBeLessThan(100);
			expect(links.length).toBe(1);
			// Unbalanced paren is trimmed
			expect(links[0].text).toBe(`https://${"a".repeat(100)}`);
		});

		it("should handle repeated parentheses pattern efficiently", async () => {
			// Another ReDoS pattern: alternating parens
			const input = `https://example.com/${"()".repeat(50)}`;
			const terminal = createMockTerminal([{ text: input }]);
			const onOpen = mock();
			const provider = new UrlLinkProvider(terminal, onOpen);

			const start = performance.now();
			const links = await getLinks(provider, 1);
			const elapsed = performance.now() - start;

			expect(elapsed).toBeLessThan(100);
			expect(links.length).toBe(1);
		});

		it("should handle long URL with unmatched open paren", async () => {
			const input = `https://example.com/${"x".repeat(50)}(${"y".repeat(50)}`;
			const terminal = createMockTerminal([{ text: input }]);
			const onOpen = mock();
			const provider = new UrlLinkProvider(terminal, onOpen);

			const start = performance.now();
			const links = await getLinks(provider, 1);
			const elapsed = performance.now() - start;

			expect(elapsed).toBeLessThan(100);
			expect(links.length).toBe(1);
		});
	});

	describe("edge cases", () => {
		it("should handle empty lines", async () => {
			const terminal = createMockTerminal([{ text: "" }]);
			const onOpen = mock();
			const provider = new UrlLinkProvider(terminal, onOpen);

			const links = await getLinks(provider, 1);

			expect(links.length).toBe(0);
		});

		it("should handle line that doesn't exist", async () => {
			const terminal = createMockTerminal([{ text: "Hello" }]);
			const onOpen = mock();
			const provider = new UrlLinkProvider(terminal, onOpen);

			const links = await getLinks(provider, 999);

			expect(links.length).toBe(0);
		});

		it("should handle lines without URLs", async () => {
			const terminal = createMockTerminal([
				{ text: "This is just some text without links" },
			]);
			const onOpen = mock();
			const provider = new UrlLinkProvider(terminal, onOpen);

			const links = await getLinks(provider, 1);

			expect(links.length).toBe(0);
		});

		it("should not match file paths as URLs", async () => {
			const terminal = createMockTerminal([{ text: "/path/to/file.ts" }]);
			const onOpen = mock();
			const provider = new UrlLinkProvider(terminal, onOpen);

			const links = await getLinks(provider, 1);

			expect(links.length).toBe(0);
		});
	});
});
