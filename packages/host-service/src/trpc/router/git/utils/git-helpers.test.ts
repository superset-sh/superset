import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ChangedFile } from "../types";
import {
	countUntrackedFileLines,
	parseNameStatus,
	parseNumstat,
} from "./git-helpers";

describe("parseNumstat", () => {
	test("regular file entry", () => {
		const raw = "5\t2\tsrc/foo.ts\0";
		const result = parseNumstat(raw);
		expect(result.get("src/foo.ts")).toEqual({
			additions: 5,
			deletions: 2,
			isBinary: false,
		});
	});

	test("multiple regular entries", () => {
		const raw = "5\t2\tsrc/foo.ts\x003\t0\tsrc/bar.ts\x00";
		const result = parseNumstat(raw);
		expect(result.get("src/foo.ts")).toEqual({
			additions: 5,
			deletions: 2,
			isBinary: false,
		});
		expect(result.get("src/bar.ts")).toEqual({
			additions: 3,
			deletions: 0,
			isBinary: false,
		});
	});

	test("exact rename with edits indexes both paths", () => {
		const raw = "4\t3\t\x00src/old.ts\x00src/new.ts\x00";
		const result = parseNumstat(raw);
		expect(result.get("src/new.ts")).toEqual({
			additions: 4,
			deletions: 3,
			isBinary: false,
		});
		expect(result.get("src/old.ts")).toEqual({
			additions: 4,
			deletions: 3,
			isBinary: false,
		});
	});

	test("pure rename with zero line changes", () => {
		const raw = "0\t0\t\x00src/old.ts\x00src/new.ts\x00";
		const result = parseNumstat(raw);
		expect(result.get("src/new.ts")).toEqual({
			additions: 0,
			deletions: 0,
			isBinary: false,
		});
		expect(result.get("src/old.ts")).toEqual({
			additions: 0,
			deletions: 0,
			isBinary: false,
		});
	});

	test("binary file with dash markers", () => {
		const raw = "-\t-\tassets/image.png\0";
		const result = parseNumstat(raw);
		expect(result.get("assets/image.png")).toEqual({
			additions: 0,
			deletions: 0,
			isBinary: true,
		});
	});

	test("mixed regular, rename, and binary", () => {
		const raw =
			"5\t2\tsrc/foo.ts\x00" +
			"4\t3\t\x00src/old.ts\x00src/new.ts\x00" +
			"-\t-\tassets/image.png\x00";
		const result = parseNumstat(raw);
		expect(result.get("src/foo.ts")).toEqual({
			additions: 5,
			deletions: 2,
			isBinary: false,
		});
		expect(result.get("src/new.ts")).toEqual({
			additions: 4,
			deletions: 3,
			isBinary: false,
		});
		expect(result.get("src/old.ts")).toEqual({
			additions: 4,
			deletions: 3,
			isBinary: false,
		});
		expect(result.get("assets/image.png")).toEqual({
			additions: 0,
			deletions: 0,
			isBinary: true,
		});
	});

	test("empty input returns empty map", () => {
		expect(parseNumstat("")).toEqual(new Map());
	});

	test("path containing tab is preserved as-is", () => {
		const raw = "1\t1\tweird\tpath.ts\0";
		const result = parseNumstat(raw);
		expect(result.get("weird\tpath.ts")).toEqual({
			additions: 1,
			deletions: 1,
			isBinary: false,
		});
	});

	test("rename where both paths contain tabs", () => {
		const raw = "2\t1\t\x00weird\told.ts\x00weird\tnew.ts\x00";
		const result = parseNumstat(raw);
		expect(result.get("weird\told.ts")).toEqual({
			additions: 2,
			deletions: 1,
			isBinary: false,
		});
		expect(result.get("weird\tnew.ts")).toEqual({
			additions: 2,
			deletions: 1,
			isBinary: false,
		});
	});

	test("non-ASCII path (raw UTF-8)", () => {
		const raw = "3\t1\tsrc/日本語.ts\0";
		const result = parseNumstat(raw);
		expect(result.get("src/日本語.ts")).toEqual({
			additions: 3,
			deletions: 1,
			isBinary: false,
		});
	});
});

describe("parseNameStatus", () => {
	test("regular modification", () => {
		const raw = "M\x00src/foo.ts\x00";
		expect(parseNameStatus(raw)).toEqual([{ status: "M", path: "src/foo.ts" }]);
	});

	test("multiple regular entries", () => {
		const raw = "M\x00src/foo.ts\x00A\x00src/bar.ts\x00D\x00src/baz.ts\x00";
		expect(parseNameStatus(raw)).toEqual([
			{ status: "M", path: "src/foo.ts" },
			{ status: "A", path: "src/bar.ts" },
			{ status: "D", path: "src/baz.ts" },
		]);
	});

	test("rename with similarity score", () => {
		const raw = "R100\x00src/old.ts\x00src/new.ts\x00";
		expect(parseNameStatus(raw)).toEqual([
			{ status: "R", path: "src/new.ts", oldPath: "src/old.ts" },
		]);
	});

	test("copy with similarity score", () => {
		const raw = "C85\x00src/src.ts\x00src/copy.ts\x00";
		expect(parseNameStatus(raw)).toEqual([
			{ status: "C", path: "src/copy.ts", oldPath: "src/src.ts" },
		]);
	});

	test("non-ASCII path stays raw (matches numstat -z)", () => {
		const raw = "M\x00src/日本語.ts\x00";
		expect(parseNameStatus(raw)).toEqual([
			{ status: "M", path: "src/日本語.ts" },
		]);
	});

	test("path containing tab is preserved", () => {
		const raw = "M\x00weird\tpath.ts\x00";
		expect(parseNameStatus(raw)).toEqual([
			{ status: "M", path: "weird\tpath.ts" },
		]);
	});

	test("mixed regular and rename", () => {
		const raw =
			"M\x00src/foo.ts\x00R85\x00src/old.ts\x00src/new.ts\x00A\x00src/bar.ts\x00";
		expect(parseNameStatus(raw)).toEqual([
			{ status: "M", path: "src/foo.ts" },
			{ status: "R", path: "src/new.ts", oldPath: "src/old.ts" },
			{ status: "A", path: "src/bar.ts" },
		]);
	});

	test("empty input returns empty array", () => {
		expect(parseNameStatus("")).toEqual([]);
	});
});

describe("countUntrackedFileLines", () => {
	let dir: string;

	beforeAll(async () => {
		dir = await mkdtemp(join(tmpdir(), "untracked-lines-"));
	});

	afterAll(async () => {
		await rm(dir, { recursive: true, force: true });
	});

	const SENTINEL = -999;
	function makeFile(path: string): ChangedFile {
		return { path, status: "untracked", additions: SENTINEL, deletions: 0 };
	}

	async function count(name: string, contents: Buffer | string) {
		await writeFile(join(dir, name), contents);
		const file = makeFile(name);
		await countUntrackedFileLines(dir, [file]);
		return file;
	}

	test("counts lines with a trailing newline", async () => {
		const file = await count("trailing.txt", "a\nb\nc\n");
		expect(file.additions).toBe(3);
		expect(file.isBinary).toBeUndefined();
	});

	test("counts a final line with no trailing newline", async () => {
		const file = await count("no-trailing.txt", "a\nb\nc");
		expect(file.additions).toBe(3);
	});

	test("empty file is zero lines", async () => {
		const file = await count("empty.txt", "");
		expect(file.additions).toBe(0);
	});

	test("CRLF counts the same as LF", async () => {
		const file = await count("crlf.txt", "a\r\nb\r\nc\r\n");
		expect(file.additions).toBe(3);
	});

	test("counts correctly across read-chunk boundaries", async () => {
		// 64KB chunk size; 20000 short lines spans several chunks.
		const lineCount = 20000;
		const file = await count("big.txt", `${"x".repeat(8)}\n`.repeat(lineCount));
		expect(file.additions).toBe(lineCount);
	});

	test("flags a NUL byte in the first 8KB as binary", async () => {
		const file = await count("nul.bin", Buffer.from([0x61, 0x00, 0x62, 0x0a]));
		expect(file.isBinary).toBe(true);
		expect(file.additions).toBe(0);
	});

	test("flags by media extension without reading content", async () => {
		const file = await count("clip.mp4", "not really a video\n");
		expect(file.isBinary).toBe(true);
		expect(file.additions).toBe(0);
	});

	test("skips the LOC signal for files over the size budget", async () => {
		const file = await count("huge.txt", "a\n".repeat(600_000)); // ~1.2MB
		expect(file.additions).toBe(SENTINEL);
		expect(file.isBinary).toBeUndefined();
	});
});
