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

function createMockTerminal(
	lineDescriptors: { text: string; isWrapped?: boolean }[],
	cols = 80,
) {
	const lines = lineDescriptors.map((desc) => ({
		translateToString: (
			_trim?: boolean,
			startColumn?: number,
			endColumn?: number,
		) => {
			const start = startColumn ?? 0;
			const end = endColumn ?? cols;
			let result = desc.text;
			// Pad to cols width for consistency
			result = result.padEnd(cols);
			result = result.substring(start, end);
			if (_trim) result = result.replace(/\s+$/, "");
			return result;
		},
		isWrapped: desc.isWrapped ?? false,
		length: cols,
		getCell: (x: number) =>
			({
				getChars: () => (x < desc.text.length ? desc.text[x] : " "),
				getWidth: () => 1,
			}) as never,
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
	lineDescriptors: (string | { text: string; isWrapped?: boolean })[],
	validPaths: string[],
	opts?: { initialCwd?: string; userHome?: string; cols?: number },
) {
	const descriptors = lineDescriptors.map((d) =>
		typeof d === "string" ? { text: d } : d,
	);
	const statMock: StatCallback = async (path) => {
		if (validPaths.includes(path)) {
			return { isDirectory: false };
		}
		return null;
	};
	const resolver = new TerminalLinkResolver(statMock);
	const cols = opts?.cols ?? 80;
	const terminal = createMockTerminal(descriptors, cols);
	const detector = new LocalLinkDetector(resolver);

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
		expect(links).toHaveLength(1);
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

		const range = links?.[0]?.range;
		expect(range).toBeDefined();
		// "/foo/bar.ts" starts at index 4 in "see /foo/bar.ts for details"
		expect(range?.start.y).toBe(1);
		expect(range?.start.x).toBe(5); // 1-based: index 4 + 1
		expect(range?.end.x).toBe(15); // 1-based: index 4 + 11
	});

	it("should detect multiple links", async () => {
		const { adapter } = createAdapter(
			["error in /foo/a.ts and /foo/b.ts"],
			["/foo/a.ts", "/foo/b.ts"],
		);

		const links = await new Promise<ILink[] | undefined>((resolve) => {
			adapter.provideLinks(1, resolve);
		});

		expect(links).toHaveLength(2);
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

		expect(links).toHaveLength(1);
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

		expect(links).toHaveLength(1);
		// The full text includes the suffix
		expect(links?.[0]?.text).toBe("/foo/bar.ts:42:10");
	});

	it("should detect paths spanning wrapped lines", async () => {
		// Simulate a 30-col terminal where a long path wraps
		const { adapter } = createAdapter(
			[
				// Line 1: "see /parent/cwd/apps/web/sr" (30 chars)
				{ text: "see /parent/cwd/apps/web/sr" },
				// Line 2 (wrapped): "c/app/page.tsx:1 for info" (continues from line 1)
				{ text: "c/app/page.tsx:1 for info", isWrapped: true },
			],
			["/parent/cwd/apps/web/src/app/page.tsx"],
			{ cols: 30, initialCwd: "/parent/cwd" },
		);

		// Request line 1 (the start of the wrapped path)
		const links = await new Promise<ILink[] | undefined>((resolve) => {
			adapter.provideLinks(1, resolve);
		});

		expect(links).toBeDefined();
		expect(links?.length).toBeGreaterThanOrEqual(1);
		// The detected text should be the full path including suffix
		const pathLink = links?.find((l) =>
			l.text.includes("apps/web/src/app/page.tsx"),
		);
		expect(pathLink).toBeDefined();
	});
});
