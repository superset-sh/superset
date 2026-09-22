import { afterAll, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { forEachLine, MAX_LINE_LENGTH } from "./parse";

const root = mkdtempSync(join(tmpdir(), "usage-parse-"));
afterAll(() => rmSync(root, { recursive: true, force: true }));

async function linesOf(path: string): Promise<string[]> {
	const lines: string[] = [];
	await forEachLine(path, (line) => lines.push(line));
	return lines;
}

describe("forEachLine", () => {
	test("splits on \\n, strips \\r, keeps blank lines, delivers an unterminated last line", async () => {
		const path = join(root, "plain.jsonl");
		writeFileSync(path, "a\r\nb\n\nc");
		expect(await linesOf(path)).toEqual(["a", "b", "", "c"]);
	});

	test("reassembles a line that spans read chunks, including a split multibyte character", async () => {
		// Chunks are 64 KiB; a 3-byte character never divides that evenly, so
		// some boundary lands mid-character.
		const path = join(root, "spanning.jsonl");
		const line = "€".repeat(100_000);
		writeFileSync(path, `${line}\n${line}\n`);
		expect(await linesOf(path)).toEqual([line, line]);
	});

	test("skips a line past MAX_LINE_LENGTH and keeps reading after it", async () => {
		const path = join(root, "oversized.jsonl");
		writeFileSync(
			path,
			`first\n${"y".repeat(MAX_LINE_LENGTH)}\n${"x".repeat(MAX_LINE_LENGTH + 1)}\nlast\n`,
		);
		const lines = await linesOf(path);
		expect(lines.map((line) => line.length)).toEqual([
			"first".length,
			MAX_LINE_LENGTH,
			"last".length,
		]);
	});

	test("a CRLF line of exactly MAX_LINE_LENGTH is kept: the CR does not count", async () => {
		const path = join(root, "crlf-boundary.jsonl");
		writeFileSync(path, `${"y".repeat(MAX_LINE_LENGTH)}\r\nlast\r\n`);
		const lines = await linesOf(path);
		expect(lines.map((line) => line.length)).toEqual([
			MAX_LINE_LENGTH,
			"last".length,
		]);
	});

	test("finishes a file whose newline-free tail is past MAX_LINE_LENGTH", async () => {
		const path = join(root, "unterminated.jsonl");
		writeFileSync(path, `first\n${"x".repeat(MAX_LINE_LENGTH + 1)}`);
		expect(await linesOf(path)).toEqual(["first"]);
	});

	test("skips an unreadable file without throwing", async () => {
		expect(await linesOf(join(root, "missing.jsonl"))).toEqual([]);
	});
});
