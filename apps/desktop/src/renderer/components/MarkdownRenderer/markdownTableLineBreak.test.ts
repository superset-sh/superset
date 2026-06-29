import { describe, expect, test } from "bun:test";
import { toString as mdastToString } from "mdast-util-to-string";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import { unified } from "unified";

/**
 * Reproduction for GitHub issue #5363 — "Issue with Markdown Table Rendering
 * (Broken layout due to line breaks and long text in cells)".
 *
 * The reporter observed that a Markdown table whose cell contains a line break
 * (e.g. wrapped long text, or text split across physical lines) renders broken:
 * only the header is recognised as a table, and the remaining data overflows
 * into fragmented rows with raw `|` pipes leaking into the content.
 *
 * The Markdown renderers in the desktop app are GFM-based: the read-only TipTap
 * renderer parses via `markdown-it`, and `CommentMarkdown` / `markdownPreview`
 * parse via `remark-gfm`. Per the GFM spec a table cell may NOT contain a raw
 * newline — every physical line is a separate table row. These tests use the
 * same `remark-parse` + `remark-gfm` pipeline as `markdownPreview.ts` to pin
 * down the behaviour the user is hitting.
 */

const processor = unified().use(remarkParse).use(remarkGfm);

/** Parse markdown and return the first table as a 2-D array of cell text. */
function parseTableCells(markdown: string): string[][] | null {
	const tree = processor.parse(markdown) as { children?: Array<unknown> };
	processor.runSync(tree as never);
	const table = (tree.children ?? []).find(
		(
			node,
		): node is { type: string; children: Array<{ children: unknown[] }> } =>
			typeof node === "object" &&
			node !== null &&
			(node as { type?: string }).type === "table",
	);
	if (!table) return null;
	return table.children.map((row) =>
		row.children.map((cell) => mdastToString(cell)),
	);
}

describe("markdown table rendering with line breaks in cells (issue #5363)", () => {
	test("a well-formed table with single-line cells renders as expected", () => {
		const markdown = [
			"| Name | Note |",
			"| --- | --- |",
			"| Tanaka | short |",
		].join("\n");

		expect(parseTableCells(markdown)).toEqual([
			["Name", "Note"],
			["Tanaka", "short"],
		]);
	});

	test("REPRODUCES #5363: a line break inside a cell fragments the data row", () => {
		// The author intends a single data row whose "Note" cell holds two lines.
		const markdown = [
			"| Name | Note |",
			"| --- | --- |",
			"| Tanaka | first line",
			"second line |",
		].join("\n");

		const cells = parseTableCells(markdown);

		// EXPECTED (what the reporter wants): one data row, "Note" = both lines.
		//   [["Name", "Note"], ["Tanaka", "first line second line"]]
		//
		// ACTUAL (the bug): the single data row is shredded into two malformed
		// rows. The second physical line leaks out as its own row, dropping the
		// "Tanaka" column and the trailing pipe — exactly the "rows are fragmented
		// / data rows overflow" symptom from the issue.
		expect(cells).toEqual([
			["Name", "Note"],
			["Tanaka", "first line"],
			["second line"],
		]);

		// Pin the user-visible failures so a future fix flips these assertions:
		// the table has an extra (overflow) row...
		expect(cells).not.toEqual([
			["Name", "Note"],
			["Tanaka", "first line second line"],
		]);
		// ...and the orphaned fragment has fewer columns than the header.
		const header = cells?.[0] ?? [];
		const orphanRow = cells?.[cells.length - 1] ?? [];
		expect(orphanRow.length).toBeLessThan(header.length);
	});
});
