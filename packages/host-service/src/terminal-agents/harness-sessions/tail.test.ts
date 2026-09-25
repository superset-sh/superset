import { afterEach, describe, expect, spyOn, test } from "bun:test";
import * as fs from "node:fs";
import { mkdtempSync, rmSync, truncateSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readFileTail } from "./tail";

const created: string[] = [];

afterEach(() => {
	for (const path of created.splice(0)) {
		rmSync(path, { recursive: true, force: true });
	}
});

describe("readFileTail", () => {
	test("reads only the tail of a file past the byte bound", () => {
		const dir = mkdtempSync(join(tmpdir(), "tail-fixture-"));
		created.push(dir);
		const path = join(dir, "big.jsonl");
		writeFileSync(path, `${"x".repeat(5000)}TAIL-MARKER`);

		const tail = readFileTail(path, 100);
		expect(tail).toBe(`${"x".repeat(89)}TAIL-MARKER`);
		expect(tail?.length).toBe(100);
	});

	test("reads no stale bytes when the file shrinks between stat and read", () => {
		const dir = mkdtempSync(join(tmpdir(), "tail-fixture-"));
		created.push(dir);
		const path = join(dir, "live.jsonl");
		writeFileSync(path, "y".repeat(10_000));
		const realRead = fs.readSync;
		const readSpy = spyOn(fs, "readSync").mockImplementation(((
			...args: Parameters<typeof fs.readSync>
		) => {
			truncateSync(path, 0);
			return realRead(...args);
		}) as typeof fs.readSync);
		try {
			expect(readFileTail(path, 4_096)).toBe("");
		} finally {
			readSpy.mockRestore();
		}
	});
});
