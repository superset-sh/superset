import { describe, expect, test } from "bun:test";
import { fenceState } from "./fenceState";
import { splitBlocks, splitForStreaming } from "./splitBlocks";

const DOCUMENT = [
	"# Heading",
	"",
	"A paragraph with **bold** text that goes on for a while.",
	"",
	"- one",
	"- two",
	"",
	"```ts",
	"const x = 1;",
	"```",
	"",
	"Final paragraph.",
].join("\n");

describe("splitBlocks", () => {
	test("block raws round-trip to the original text", () => {
		expect(splitBlocks(DOCUMENT).join("")).toBe(DOCUMENT);
	});

	test("settled blocks are byte-identical as the stream grows", () => {
		for (let cut = 1; cut < DOCUMENT.length; cut++) {
			const partial = splitForStreaming(DOCUMENT.slice(0, cut));
			const full = splitBlocks(DOCUMENT);
			for (const [index, block] of partial.stable.entries()) {
				expect(block).toBe(full[index] as string);
			}
		}
	});
});

describe("fenceState", () => {
	test("detects an open fence with language", () => {
		expect(fenceState("text\n```ts\nconst x = 1;")).toEqual({
			open: true,
			lang: "ts",
		});
	});

	test("detects a closed fence", () => {
		expect(fenceState("```ts\nconst x = 1;\n```\nafter")).toEqual({
			open: false,
			lang: null,
		});
	});

	test("nested longer fence does not close a shorter opener", () => {
		expect(fenceState("````md\n```\ninner\n```\n")).toEqual({
			open: true,
			lang: "md",
		});
	});

	test("tilde fences close tilde fences only", () => {
		expect(fenceState("~~~\ncode\n```\n")).toEqual({ open: true, lang: null });
		expect(fenceState("~~~\ncode\n~~~\n")).toEqual({ open: false, lang: null });
	});
});
