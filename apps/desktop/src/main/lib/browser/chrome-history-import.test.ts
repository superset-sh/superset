import { describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
	type ChromeUrlRow,
	chromeTimeToUnixMs,
	mapUrlRowsToEntries,
	readHistoryFromProfile,
} from "./chrome-history-import";

// The actual SQLite read runs in Electron (Node), where better-sqlite3 loads;
// Bun's test runner can't load that native module, so the DB read itself is
// covered in the app rather than here. The row-mapping logic is pure and tested
// directly via mapUrlRowsToEntries().

const CHROME_EPOCH_OFFSET_MS = 11_644_473_600_000;

/** Converts a Unix-ms timestamp to the Chrome microsecond value it came from. */
function unixMsToChromeTime(unixMs: number): number {
	return (unixMs + CHROME_EPOCH_OFFSET_MS) * 1000;
}

describe("chromeTimeToUnixMs", () => {
	it("maps the Chrome epoch origin to Unix 0", () => {
		expect(chromeTimeToUnixMs(CHROME_EPOCH_OFFSET_MS * 1000)).toBe(0);
	});

	it("round-trips a real timestamp", () => {
		const unixMs = 1_700_000_000_000;
		expect(chromeTimeToUnixMs(unixMsToChromeTime(unixMs))).toBe(unixMs);
	});

	it("returns null for the never-visited sentinel", () => {
		expect(chromeTimeToUnixMs(0)).toBeNull();
		expect(chromeTimeToUnixMs(-1)).toBeNull();
	});
});

describe("mapUrlRowsToEntries", () => {
	it("converts timestamps and preserves order given by the query", () => {
		const newer = 1_700_000_000_000;
		const older = 1_600_000_000_000;
		const rows: ChromeUrlRow[] = [
			{
				url: "https://new.example",
				title: "New",
				visit_count: 5,
				last_visit_time: unixMsToChromeTime(newer),
			},
			{
				url: "https://old.example",
				title: "Old",
				visit_count: 2,
				last_visit_time: unixMsToChromeTime(older),
			},
		];

		expect(mapUrlRowsToEntries(rows)).toEqual([
			{
				url: "https://new.example",
				title: "New",
				visitCount: 5,
				lastVisitedAt: newer,
			},
			{
				url: "https://old.example",
				title: "Old",
				visitCount: 2,
				lastVisitedAt: older,
			},
		]);
	});

	it("drops rows with no URL or no visit time", () => {
		const rows: ChromeUrlRow[] = [
			{ url: null, title: "x", visit_count: 1, last_visit_time: 1 },
			{
				url: "https://never.example",
				title: "",
				visit_count: 0,
				last_visit_time: 0,
			},
			{
				url: "https://real.example",
				title: "Real",
				visit_count: 1,
				last_visit_time: unixMsToChromeTime(1_700_000_000_000),
			},
		];

		expect(mapUrlRowsToEntries(rows).map((entry) => entry.url)).toEqual([
			"https://real.example",
		]);
	});

	it("defaults a missing title and visit count", () => {
		const rows: ChromeUrlRow[] = [
			{
				url: "https://x.example",
				title: null,
				visit_count: null,
				last_visit_time: unixMsToChromeTime(1_700_000_000_000),
			},
		];

		const [entry] = mapUrlRowsToEntries(rows);
		expect(entry?.title).toBe("");
		expect(entry?.visitCount).toBe(1);
	});
});

describe("readHistoryFromProfile", () => {
	it("returns nothing when the profile has no History file", async () => {
		const emptyDir = mkdtempSync(path.join(tmpdir(), "chrome-import-empty-"));
		try {
			expect(await readHistoryFromProfile(emptyDir)).toEqual([]);
		} finally {
			rmSync(emptyDir, { recursive: true, force: true });
		}
	});
});
