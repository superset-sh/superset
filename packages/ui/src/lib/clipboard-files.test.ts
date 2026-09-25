import { describe, expect, it } from "bun:test";
import { getClipboardFiles } from "./clipboard-files";

function makeFile(
	name: string,
	bytes: string,
	options: { type?: string; lastModified?: number } = {},
): File {
	return new File([bytes], name, {
		type: options.type ?? "image/png",
		lastModified: options.lastModified ?? 1,
	});
}

/**
 * A clipboard payload. `items` is given explicitly because the whole point of
 * the helper is that it does not mirror `files` — a real multi-file paste can
 * surface one item for several files.
 */
function makeTransfer(options: {
	files?: File[];
	items?: Array<{ kind: string; file?: File | null }>;
}): DataTransfer {
	return {
		files: options.files ?? [],
		items: (options.items ?? []).map((item) => ({
			kind: item.kind,
			getAsFile: () => item.file ?? null,
		})),
	} as unknown as DataTransfer;
}

describe("getClipboardFiles", () => {
	it("returns every file when the payload carries several", () => {
		const a = makeFile("a.png", "a");
		const b = makeFile("b.png", "bb");
		const c = makeFile("c.png", "ccc");

		expect(
			getClipboardFiles(
				makeTransfer({
					files: [a, b, c],
					// A Finder copy of three files: both lists carry all three.
					items: [
						{ kind: "file", file: a },
						{ kind: "file", file: b },
						{ kind: "file", file: c },
					],
				}),
			),
		).toEqual([a, b, c]);
	});

	it("falls back to items when the payload exposes no files list", () => {
		const a = makeFile("a.png", "a");
		const b = makeFile("b.png", "bb");

		expect(
			getClipboardFiles(
				makeTransfer({
					files: [],
					items: [
						{ kind: "file", file: a },
						{ kind: "file", file: b },
					],
				}),
			),
		).toEqual([a, b]);
	});

	it("counts a file listed in both sources once", () => {
		const a = makeFile("a.png", "a");
		const b = makeFile("b.png", "bb");

		expect(
			getClipboardFiles(
				makeTransfer({
					files: [a, b],
					items: [
						{ kind: "file", file: a },
						{ kind: "file", file: b },
					],
				}),
			),
		).toEqual([a, b]);
	});

	it("counts a file once when the two lists disagree on lastModified", () => {
		// Chromium builds a separate File per accessor and timestamps each on
		// creation, so the same pasted screenshot arrives a millisecond apart in
		// the two lists. Keying on lastModified attaches every image twice.
		const viaFiles = makeFile("image.png", "xy", {
			lastModified: 1787880688223,
		});
		const viaItems = makeFile("image.png", "xy", {
			lastModified: 1787880688224,
		});

		expect(
			getClipboardFiles(
				makeTransfer({
					files: [viaFiles],
					items: [{ kind: "file", file: viaItems }],
				}),
			),
		).toEqual([viaFiles]);
	});

	it("ignores string items and items with no file behind them", () => {
		const a = makeFile("a.png", "a");

		expect(
			getClipboardFiles(
				makeTransfer({
					files: [],
					items: [
						{ kind: "string" },
						{ kind: "file", file: null },
						{ kind: "file", file: a },
					],
				}),
			),
		).toEqual([a]);
	});

	it("returns nothing for an absent or empty payload", () => {
		expect(getClipboardFiles(null)).toEqual([]);
		expect(getClipboardFiles(undefined)).toEqual([]);
		expect(getClipboardFiles(makeTransfer({}))).toEqual([]);
	});
});
