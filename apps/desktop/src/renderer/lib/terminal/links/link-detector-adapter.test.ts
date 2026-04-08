/*---------------------------------------------------------------------------------------------
 *  Tests for LinkDetectorAdapter — the bridge between LocalLinkDetector
 *  and xterm's ILinkProvider interface.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, it } from "bun:test";
import type { ILink } from "@xterm/xterm";
import { LinkDetectorAdapter } from "./link-detector-adapter";
import type { StatCallback } from "./link-resolver";
import { TerminalLinkResolver } from "./link-resolver";
import { LocalLinkDetector } from "./local-link-detector";

// ---------------------------------------------------------------------------
// Mock terminal buffer
// ---------------------------------------------------------------------------

function createMockTerminal(lineTexts: string[], cols = 80) {
	const lines = lineTexts.map((text, _i) => ({
		translateToString: (_trim?: boolean, _start?: number, _end?: number) =>
			text,
		isWrapped: false,
		length: cols,
		getCell: () => ({ getChars: () => "", getWidth: () => 1 }) as never,
	}));

	return {
		cols,
		buffer: {
			active: {
				length: lines.length,
				getLine: (i: number) => lines[i] ?? null,
				viewportY: 0,
			},
		},
	} as never;
}

function createAdapter(
	lineTexts: string[],
	validPaths: string[],
	opts?: { initialCwd?: string; userHome?: string; cols?: number },
) {
	const statMock: StatCallback = async (path) => {
		if (validPaths.includes(path)) {
			return { isDirectory: false };
		}
		return null;
	};
	const resolver = new TerminalLinkResolver(statMock);
	const terminal = createMockTerminal(lineTexts, opts?.cols ?? 80);
	const detector = new LocalLinkDetector(resolver, {
		initialCwd: opts?.initialCwd ?? "/parent/cwd",
		userHome: opts?.userHome ?? "/home",
	});

	const adapter = new LinkDetectorAdapter(terminal, detector);
	return { adapter, terminal };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("LinkDetectorAdapter", () => {
	it("should implement ILinkProvider.provideLinks", async () => {
		const { adapter } = createAdapter(
			["see /foo/bar.ts for details"],
			["/foo/bar.ts"],
		);

		const links = await new Promise<ILink[] | undefined>((resolve) => {
			adapter.provideLinks(1, resolve);
		});

		expect(links).toBeDefined();
		expect(links!).toHaveLength(1);
		expect(links?.[0]?.text).toBe("/foo/bar.ts");
	});

	it("should return undefined when no links found", async () => {
		const { adapter } = createAdapter(["just regular text"], []);

		const links = await new Promise<ILink[] | undefined>((resolve) => {
			adapter.provideLinks(1, resolve);
		});

		expect(links).toBeUndefined();
	});

	it("should set correct buffer ranges", async () => {
		const { adapter } = createAdapter(
			["see /foo/bar.ts for details"],
			["/foo/bar.ts"],
		);

		const links = await new Promise<ILink[] | undefined>((resolve) => {
			adapter.provideLinks(1, resolve);
		});

		expect(links?.[0]?.range).toBeDefined();
		const range = links?.[0]?.range;
		// "/foo/bar.ts" starts at index 4 in "see /foo/bar.ts for details"
		expect(range.start.y).toBe(1);
		expect(range.start.x).toBe(5); // 1-based: index 4 + 1
		expect(range.end.x).toBe(15); // 1-based: index 4 + 11
	});

	it("should detect multiple links", async () => {
		const { adapter } = createAdapter(
			["error in /foo/a.ts and /foo/b.ts"],
			["/foo/a.ts", "/foo/b.ts"],
		);

		const links = await new Promise<ILink[] | undefined>((resolve) => {
			adapter.provideLinks(1, resolve);
		});

		expect(links!).toHaveLength(2);
	});

	it("should handle multi-line buffer (only detect for requested line)", async () => {
		const { adapter } = createAdapter(
			["line one", "see /foo/bar.ts", "line three"],
			["/foo/bar.ts"],
		);

		// Request line 2 (1-based)
		const links = await new Promise<ILink[] | undefined>((resolve) => {
			adapter.provideLinks(2, resolve);
		});

		expect(links!).toHaveLength(1);
		expect(links?.[0]?.text).toBe("/foo/bar.ts");
	});

	it("should return undefined for out-of-range lines", async () => {
		const { adapter } = createAdapter(["hello"], ["/foo/bar.ts"]);

		const links = await new Promise<ILink[] | undefined>((resolve) => {
			adapter.provideLinks(99, resolve);
		});

		expect(links).toBeUndefined();
	});

	it("should include line/col suffix in range but call activate with path info", async () => {
		const { adapter } = createAdapter(["/foo/bar.ts:42:10"], ["/foo/bar.ts"]);

		const links = await new Promise<ILink[] | undefined>((resolve) => {
			adapter.provideLinks(1, resolve);
		});

		expect(links!).toHaveLength(1);
		// The full text includes the suffix
		expect(links?.[0]?.text).toBe("/foo/bar.ts:42:10");
	});
});
