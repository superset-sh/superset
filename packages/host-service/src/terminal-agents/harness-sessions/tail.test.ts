import { afterEach, describe, expect, spyOn, test } from "bun:test";
import * as fs from "node:fs";
import { mkdtempSync, rmSync, truncateSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readTurnsFromTail } from "./tail";

const created: string[] = [];

afterEach(() => {
	for (const path of created.splice(0)) {
		rmSync(path, { recursive: true, force: true });
	}
});

const MB = 1024 * 1024;
const lines = (raw: string) => raw.split("\n").filter(Boolean);

function seedFile(body: string): string {
	const dir = mkdtempSync(join(tmpdir(), "tail-fixture-"));
	created.push(dir);
	const path = join(dir, "session.jsonl");
	writeFileSync(path, body);
	return path;
}

describe("readTurnsFromTail", () => {
	test("rejoins a line the first read cut in half", () => {
		const straddling = `straddle-${"s".repeat(2_000)}`;
		const path = seedFile(
			`oldest\n${straddling}\n${"f".repeat(4 * MB - 1_000)}\nnewest\n`,
		);

		expect(readTurnsFromTail(path, 10 * MB, lines)?.split("\n\n")).toEqual([
			"oldest",
			straddling,
			"f".repeat(4 * MB - 1_000),
			"newest",
		]);
	});

	test("reads each byte of the file once however far it widens", () => {
		const path = seedFile(`${"x".repeat(1023)}\n`.repeat(10 * 1024));
		const realRead = fs.readSync;
		let bytesRead = 0;
		const read = spyOn(fs, "readSync").mockImplementation(((
			...args: Parameters<typeof fs.readSync>
		) => {
			const count = realRead(...args);
			bytesRead += count;
			return count;
		}) as typeof fs.readSync);
		try {
			readTurnsFromTail(path, Number.POSITIVE_INFINITY, lines);
		} finally {
			read.mockRestore();
		}
		expect(bytesRead).toBe(10 * MB);
	});

	test("stops once the budget is filled", () => {
		const path = seedFile(`${"old\n".repeat(2 * MB)}${"new\n".repeat(1_000)}`);
		const turns = readTurnsFromTail(path, 100, lines)?.split("\n\n") ?? [];
		expect(turns.at(-1)).toBe("new");
		expect(turns.length).toBeLessThan(2 * MB);
	});

	test("keeps the earlier reads when a wider read comes back short", () => {
		const path = seedFile(`older\n${"f".repeat(5 * MB)}\nnewest\n`);
		const realRead = fs.readSync;
		let reads = 0;
		const read = spyOn(fs, "readSync").mockImplementation(((
			...args: Parameters<typeof fs.readSync>
		) => {
			const count = realRead(...args);
			return ++reads > 1 ? Math.floor(count / 2) : count;
		}) as typeof fs.readSync);
		try {
			expect(readTurnsFromTail(path, 10 * MB, lines)).toBe("newest");
		} finally {
			read.mockRestore();
		}
	});

	test("reads no stale bytes when the file shrinks between stat and read", () => {
		const path = seedFile("y".repeat(10_000));
		const realRead = fs.readSync;
		const read = spyOn(fs, "readSync").mockImplementation(((
			...args: Parameters<typeof fs.readSync>
		) => {
			truncateSync(path, 0);
			return realRead(...args);
		}) as typeof fs.readSync);
		try {
			expect(readTurnsFromTail(path, 100, lines)).toBeNull();
		} finally {
			read.mockRestore();
		}
	});
});
