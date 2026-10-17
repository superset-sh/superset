import { afterAll, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { zstdCompressSync } from "node:zlib";
import {
	forEachLine,
	MAX_LINE_LENGTH,
	parseCodexLogFile,
	type UsageLogEntry,
} from "./parse";

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

	test("reads a .zst file through zstd, including a character split across chunks", async () => {
		const path = join(root, "compressed.jsonl.zst");
		const line = "€".repeat(100_000);
		writeFileSync(path, zstdCompressSync(`${line}\nlast\n`));
		expect(await linesOf(path)).toEqual([line, "last"]);
	});

	test("skips a corrupt .zst file without throwing", async () => {
		const path = join(root, "corrupt.jsonl.zst");
		writeFileSync(path, "not zstd\n");
		expect(await linesOf(path)).toEqual([]);
	});
});

describe("parseCodexLogFile", () => {
	test("reads a compressed rollout under the same session id as the plain file", async () => {
		const path = join(root, "rollout-2026-10-01T09-00-00-abc.jsonl.zst");
		const lines = [
			{ type: "turn_context", payload: { model: "gpt-6.1-sol", cwd: "/repo" } },
			{
				type: "event_msg",
				timestamp: "2026-10-01T09:00:05.000Z",
				payload: {
					type: "token_count",
					info: {
						last_token_usage: {
							input_tokens: 1_000,
							cached_input_tokens: 800,
							output_tokens: 50,
						},
					},
				},
			},
		];
		writeFileSync(
			path,
			zstdCompressSync(lines.map((line) => JSON.stringify(line)).join("\n")),
		);

		const entries: UsageLogEntry[] = [];
		await parseCodexLogFile({ path, mtimeMs: Date.now() }, 0, entries);

		expect(entries).toEqual([
			expect.objectContaining({
				agent: "codex",
				model: "gpt-6.1-sol",
				cwd: "/repo",
				sessionId: "rollout-2026-10-01T09-00-00-abc",
				uncachedInput: 200,
				cachedInput: 800,
				output: 50,
			}),
		]);
	});
});
