import { describe, expect, test } from "bun:test";
import { isInlineCode } from "./CodeBlock";

/**
 * Regression coverage for the "rendered markdown collapses whitespace in code
 * blocks" bug (see issue #5658).
 *
 * `ReadOnlyCodeBlockView` renders fenced code blocks through `CodeBlock`
 * without supplying a `node`. When the fence has no language, the old inline
 * heuristic `!language && node?.position?.start.line === node?.position?.end.line`
 * evaluated to `!language && (undefined === undefined)` === `true`, so the block
 * was rendered as inline `<code>` (`white-space: normal`), collapsing runs of
 * spaces and stripping leading indentation from ASCII diagrams / aligned text.
 */
describe("isInlineCode", () => {
	test("treats a language-less block code node (no node metadata) as a block, not inline", () => {
		// This is exactly what ReadOnlyCodeBlockView passes: a fenced block with
		// no language and no node position. It must render as a block so
		// whitespace is preserved.
		expect(isInlineCode(undefined, undefined)).toBe(false);
	});

	test("treats genuine single-line inline code as inline", () => {
		expect(
			isInlineCode(undefined, {
				position: {
					start: { line: 3, column: 1 },
					end: { line: 3, column: 8 },
				},
			}),
		).toBe(true);
	});

	test("treats a multi-line fenced block as a block, not inline", () => {
		expect(
			isInlineCode(undefined, {
				position: {
					start: { line: 1, column: 1 },
					end: { line: 5, column: 4 },
				},
			}),
		).toBe(false);
	});

	test("treats code with a language as a block, not inline", () => {
		expect(
			isInlineCode("typescript", {
				position: {
					start: { line: 2, column: 1 },
					end: { line: 2, column: 9 },
				},
			}),
		).toBe(false);
	});
});
