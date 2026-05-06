import { describe, expect, test } from "bun:test";
import { parseNameStatus, parseNumstat } from "./git-helpers";

describe("parseNumstat", () => {
	test("regular file entry", () => {
		const raw = "5\t2\tsrc/foo.ts\0";
		const result = parseNumstat(raw);
		expect(result.get("src/foo.ts")).toEqual({ additions: 5, deletions: 2 });
	});

	test("multiple regular entries", () => {
		const raw = "5\t2\tsrc/foo.ts\x003\t0\tsrc/bar.ts\x00";
		const result = parseNumstat(raw);
		expect(result.get("src/foo.ts")).toEqual({ additions: 5, deletions: 2 });
		expect(result.get("src/bar.ts")).toEqual({ additions: 3, deletions: 0 });
	});

	test("exact rename with edits indexes both paths", () => {
		const raw = "4\t3\t\x00src/old.ts\x00src/new.ts\x00";
		const result = parseNumstat(raw);
		expect(result.get("src/new.ts")).toEqual({ additions: 4, deletions: 3 });
		expect(result.get("src/old.ts")).toEqual({ additions: 4, deletions: 3 });
	});

	test("pure rename with zero line changes", () => {
		const raw = "0\t0\t\x00src/old.ts\x00src/new.ts\x00";
		const result = parseNumstat(raw);
		expect(result.get("src/new.ts")).toEqual({ additions: 0, deletions: 0 });
		expect(result.get("src/old.ts")).toEqual({ additions: 0, deletions: 0 });
	});

	test("binary file with dash markers", () => {
		const raw = "-\t-\tassets/image.png\0";
		const result = parseNumstat(raw);
		expect(result.get("assets/image.png")).toEqual({
			additions: 0,
			deletions: 0,
		});
	});

	test("mixed regular, rename, and binary", () => {
		const raw =
			"5\t2\tsrc/foo.ts\x00" +
			"4\t3\t\x00src/old.ts\x00src/new.ts\x00" +
			"-\t-\tassets/image.png\x00";
		const result = parseNumstat(raw);
		expect(result.get("src/foo.ts")).toEqual({ additions: 5, deletions: 2 });
		expect(result.get("src/new.ts")).toEqual({ additions: 4, deletions: 3 });
		expect(result.get("src/old.ts")).toEqual({ additions: 4, deletions: 3 });
		expect(result.get("assets/image.png")).toEqual({
			additions: 0,
			deletions: 0,
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
		});
	});

	test("rename where both paths contain tabs", () => {
		const raw = "2\t1\t\x00weird\told.ts\x00weird\tnew.ts\x00";
		const result = parseNumstat(raw);
		expect(result.get("weird\told.ts")).toEqual({ additions: 2, deletions: 1 });
		expect(result.get("weird\tnew.ts")).toEqual({ additions: 2, deletions: 1 });
	});

	test("non-ASCII path (raw UTF-8)", () => {
		const raw = "3\t1\tsrc/日本語.ts\0";
		const result = parseNumstat(raw);
		expect(result.get("src/日本語.ts")).toEqual({ additions: 3, deletions: 1 });
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
