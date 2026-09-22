import { afterEach, describe, expect, test } from "bun:test";

import { table } from "./output";

const URL = "http://localhost:3000/page/schema-history-superset-7njjhq";
const ROWS = [{ title: "Schema history", url: URL }];
const COLUMNS = ["title", "url"];
const CAPS = [30, 50];

const ESC = "\x1b";
const BEL = "\x07";
// Built from constants: a regex literal cannot hold control characters.
const OSC8 = new RegExp(`${ESC}\\]8;;[^${BEL}]*${BEL}`, "g");

const originalIsTTY = process.stdout.isTTY;

function setTTY(value: boolean | undefined): void {
	Object.defineProperty(process.stdout, "isTTY", {
		value,
		configurable: true,
	});
}

afterEach(() => setTTY(originalIsTTY));

describe("table", () => {
	test("truncates a cell wider than its cap", () => {
		setTTY(false);
		const out = table(
			[{ title: "Schema history for every published page and version" }],
			["title"],
			undefined,
			[30],
		);
		expect(out).toContain("Schema history for every publ…");
	});

	test("prints a URL in full however narrow its column", () => {
		setTTY(false);
		const out = table(ROWS, COLUMNS, undefined, CAPS);
		expect(out).toContain(URL);
		expect(out).not.toContain("…");
		expect(out).not.toContain("\x1b]8;;");
	});

	test("links the URL it prints", () => {
		setTTY(true);
		const out = table(ROWS, COLUMNS, undefined, CAPS);
		expect(out).toContain(`\x1b]8;;${URL}\x07${URL}\x1b]8;;\x07`);
	});

	test("keeps padding outside the link so it stops at the URL", () => {
		setTTY(true);
		const out = table(
			[{ url: "http://a.dev" }, { url: URL }],
			["url"],
			["URL"],
			[50],
		);
		expect(out).toContain("\x07http://a.dev\x1b]8;;\x07");
	});

	test("columns line up whether or not links are emitted", () => {
		const widths = [true, false].map((tty) => {
			setTTY(tty);
			return table(ROWS, COLUMNS, undefined, CAPS)
				.split("\n")
				.map((line) => line.replace(OSC8, "").length);
		});
		expect(widths[0]).toEqual(widths[1]!);
	});

	test("lines the next column up behind a URL wider than its cap", () => {
		setTTY(false);
		const lines = table(
			[
				{ url: URL, id: "4a436fc7" },
				{ url: "http://a.dev", id: "860b82f8" },
			],
			["url", "id"],
			["URL", "ID"],
			[20, 10],
		).split("\n");
		const starts = ["ID", "4a436fc7", "860b82f8"].map((cell, i) =>
			lines[i]?.indexOf(cell),
		);
		expect(new Set(starts).size).toBe(1);
	});

	test("leaves non-URL cells alone", () => {
		setTTY(true);
		const out = table([{ id: "not a url" }], ["id"], ["ID"], [30]);
		expect(out).not.toContain("\x1b]8;;");
	});
});
