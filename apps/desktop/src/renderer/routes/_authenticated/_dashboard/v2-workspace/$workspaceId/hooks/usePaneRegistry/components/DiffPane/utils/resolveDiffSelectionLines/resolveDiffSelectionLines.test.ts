import { describe, expect, test } from "bun:test";
import {
	type DiffSelectionRoot,
	resolveDiffSelectionLines,
} from "./resolveDiffSelectionLines";

/**
 * Bun tests run without a DOM, so we model just the slice of the shadow-root /
 * range surface the resolver reads: line rows that answer `closest`,
 * `getAttribute`, `hasAttribute`, plus a Range whose boundary nodes are text
 * nodes climbing to their line via `parentElement` (the real Chromium shape).
 */

interface FakeEl {
	closest(selectors: string): FakeEl | null;
	getAttribute(name: string): string | null;
	hasAttribute(name: string): boolean;
}

interface MakeLineArgs {
	line: string;
	lineType?: string;
	/** Side marker on the enclosing `<code>` column, for context lines. */
	column?: "additions" | "deletions";
}

/** Build a line row + the text node that sits inside it. */
function makeLine({ line, lineType, column }: MakeLineArgs): {
	row: FakeEl;
	textNode: { parentElement: FakeEl };
} {
	const codeEl: FakeEl = {
		closest: (s) => (s === "[data-code]" ? codeEl : null),
		getAttribute: (n) => (n === "data-code" ? "" : null),
		hasAttribute: (n) =>
			(n === "data-additions" && column === "additions") ||
			(n === "data-deletions" && column === "deletions"),
	};
	const row: FakeEl = {
		closest: (s) => {
			if (s === "[data-line]") return row;
			if (s === "[data-code]") return column ? codeEl : null;
			return null;
		},
		getAttribute: (n) => {
			if (n === "data-line") return line;
			if (n === "data-line-type") return lineType ?? null;
			return null;
		},
		hasAttribute: () => false,
	};
	return { row, textNode: { parentElement: row } };
}

function rootWith(range: {
	collapsed?: boolean;
	startContainer: unknown;
	endContainer: unknown;
}): DiffSelectionRoot {
	return {
		getSelection: () => ({
			rangeCount: 1,
			getRangeAt: () => ({
				collapsed: range.collapsed ?? false,
				// biome-ignore lint/suspicious/noExplicitAny: fake range boundary nodes
				startContainer: range.startContainer as any,
				// biome-ignore lint/suspicious/noExplicitAny: fake range boundary nodes
				endContainer: range.endContainer as any,
			}),
		}),
	};
}

describe("resolveDiffSelectionLines", () => {
	test("returns null when the shadow root lacks getSelection", () => {
		expect(resolveDiffSelectionLines({})).toBeNull();
		expect(resolveDiffSelectionLines(null)).toBeNull();
		expect(resolveDiffSelectionLines(undefined)).toBeNull();
	});

	test("returns null when there is no range", () => {
		const root: DiffSelectionRoot = {
			getSelection: () => ({
				rangeCount: 0,
				getRangeAt: () => undefined as never,
			}),
		};
		expect(resolveDiffSelectionLines(root)).toBeNull();
	});

	test("returns null for a collapsed (empty) selection", () => {
		const { textNode } = makeLine({ line: "10", lineType: "context" });
		const root = rootWith({
			collapsed: true,
			startContainer: textNode,
			endContainer: textNode,
		});
		expect(resolveDiffSelectionLines(root)).toBeNull();
	});

	test("returns null when a boundary is not inside a diff line row", () => {
		const orphan = { parentElement: null };
		const { textNode } = makeLine({ line: "10", lineType: "context" });
		const root = rootWith({ startContainer: orphan, endContainer: textNode });
		expect(resolveDiffSelectionLines(root)).toBeNull();
	});

	test("returns null when data-line is not a number", () => {
		const { textNode: a } = makeLine({ line: "nope" });
		const { textNode: b } = makeLine({ line: "12" });
		const root = rootWith({ startContainer: a, endContainer: b });
		expect(resolveDiffSelectionLines(root)).toBeNull();
	});

	test("resolves a multi-line selection across context lines (no side)", () => {
		const { textNode: a } = makeLine({ line: "5", lineType: "context" });
		const { textNode: b } = makeLine({ line: "9", lineType: "context" });
		const root = rootWith({ startContainer: a, endContainer: b });
		expect(resolveDiffSelectionLines(root)).toEqual({
			start: 5,
			end: 9,
			side: undefined,
		});
	});

	test("reads additions side from data-line-type=change-addition", () => {
		const { textNode: a } = makeLine({
			line: "20",
			lineType: "change-addition",
		});
		const { textNode: b } = makeLine({
			line: "22",
			lineType: "change-addition",
		});
		const root = rootWith({ startContainer: a, endContainer: b });
		expect(resolveDiffSelectionLines(root)).toEqual({
			start: 20,
			end: 22,
			side: "additions",
		});
	});

	test("reads deletions side from data-line-type=change-deletion", () => {
		const { textNode } = makeLine({ line: "7", lineType: "change-deletion" });
		const root = rootWith({ startContainer: textNode, endContainer: textNode });
		expect(resolveDiffSelectionLines(root)).toEqual({
			start: 7,
			end: 7,
			side: "deletions",
		});
	});

	test("falls back to the enclosing column for a context line's side", () => {
		const { textNode: a } = makeLine({
			line: "30",
			lineType: "context",
			column: "additions",
		});
		const { textNode: b } = makeLine({
			line: "31",
			lineType: "context",
			column: "additions",
		});
		const root = rootWith({ startContainer: a, endContainer: b });
		expect(resolveDiffSelectionLines(root)).toEqual({
			start: 30,
			end: 31,
			side: "additions",
		});
	});

	test("normalizes a reversed selection (end before start) and keeps the start line's side", () => {
		// Anchor on line 40 (deletions), focus up on line 36 (additions).
		const { textNode: anchor } = makeLine({
			line: "40",
			lineType: "change-deletion",
		});
		const { textNode: focus } = makeLine({
			line: "36",
			lineType: "change-addition",
		});
		const root = rootWith({ startContainer: anchor, endContainer: focus });
		expect(resolveDiffSelectionLines(root)).toEqual({
			start: 36,
			end: 40,
			side: "additions",
		});
	});
});
