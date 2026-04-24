import { describe, expect, it } from "bun:test";
import {
	nextChunkBoundary,
	splitMarkdownStream,
} from "./MarkdownStream.logic";

describe("splitMarkdownStream", () => {
	it("returns a single full block when not live", () => {
		expect(splitMarkdownStream("hello world", false)).toEqual([
			{ raw: "hello world", mode: "full" },
		]);
	});

	it("returns empty for empty input regardless of live mode", () => {
		expect(splitMarkdownStream("", true)).toEqual([]);
		expect(splitMarkdownStream("", false)).toEqual([]);
	});

	it("returns a single live block when no unterminated fence exists", () => {
		expect(splitMarkdownStream("just prose", true)).toEqual([
			{ raw: "just prose", mode: "live" },
		]);
	});

	it("splits at an unterminated fence so the stable prose is isolated", () => {
		const text = "stable prose\n\n```js\npartial(\n";
		const blocks = splitMarkdownStream(text, true);
		expect(blocks.map((b) => b.mode)).toEqual(["live", "live"]);
		expect(blocks[0]?.raw).toBe("stable prose\n\n");
		expect(blocks[1]?.raw).toBe("```js\npartial(\n");
	});

	it("does not split when the fence is balanced", () => {
		const text = "a\n```\ncode\n```\nb";
		const blocks = splitMarkdownStream(text, true);
		expect(blocks).toHaveLength(1);
		expect(blocks[0]?.raw).toBe(text);
	});
});

describe("nextChunkBoundary", () => {
	it("returns total when already at end", () => {
		expect(nextChunkBoundary("hello", 5)).toBe(5);
	});

	it("advances by a small step on short text", () => {
		const end = nextChunkBoundary("hi there", 0);
		expect(end).toBeGreaterThan(0);
		expect(end).toBeLessThanOrEqual("hi there".length);
	});

	it("snaps to whitespace when close to the chunk boundary", () => {
		const text = "one two three";
		const end = nextChunkBoundary(text, 0);
		expect(text[end - 1]).toBe(" ");
	});

	it("returns total when only a final fragment remains", () => {
		const text = "abcdef";
		expect(nextChunkBoundary(text, 4)).toBe(6);
	});
});
