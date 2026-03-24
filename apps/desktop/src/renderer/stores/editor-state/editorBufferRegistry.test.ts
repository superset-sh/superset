import { beforeEach, describe, expect, test } from "bun:test";
import {
	deleteDocumentBuffer,
	discardDocumentCurrentContent,
	getDocumentBaselineContent,
	getDocumentCurrentContent,
	hasInitializedDocumentBuffer,
	setDocumentCurrentContent,
	setDocumentLoadedContent,
} from "./editorBufferRegistry";

/**
 * Reproduction test for GitHub issue #2830:
 * Unchanged markdown file always gives unsaved changes modal.
 *
 * Root cause: TipTap's `editor.setEditable(editable)` emits an "update"
 * event by default. This fires the `onUpdate` handler in the markdown
 * renderer, which serializes the ProseMirror document back to markdown.
 * The tiptap-markdown serializer normalizes content during the round-trip
 * (e.g., trailing newlines, spacing), producing slightly different markdown
 * than the original raw file content. The `updateDocumentDraft` function
 * then compares this normalized content with the baseline (raw file content)
 * and marks the document as dirty — triggering the unsaved changes modal.
 */

const TEST_KEY = "test-workspace::working::test-file.md";

beforeEach(() => {
	deleteDocumentBuffer(TEST_KEY);
});

describe("editorBufferRegistry", () => {
	test("setDocumentLoadedContent sets both baseline and current", () => {
		const content = "# Hello\n\nWorld\n";
		setDocumentLoadedContent(TEST_KEY, content);

		expect(getDocumentBaselineContent(TEST_KEY)).toBe(content);
		expect(getDocumentCurrentContent(TEST_KEY)).toBe(content);
		expect(hasInitializedDocumentBuffer(TEST_KEY)).toBe(true);
	});

	test("setDocumentCurrentContent updates only current when buffer is initialized", () => {
		const raw = "# Hello\n\nWorld\n";
		setDocumentLoadedContent(TEST_KEY, raw);

		const normalized = "# Hello\n\nWorld";
		setDocumentCurrentContent(TEST_KEY, normalized);

		expect(getDocumentBaselineContent(TEST_KEY)).toBe(raw);
		expect(getDocumentCurrentContent(TEST_KEY)).toBe(normalized);
	});

	test("dirty detection: current !== baseline after normalization", () => {
		const raw = "# Hello\n\nWorld\n";
		setDocumentLoadedContent(TEST_KEY, raw);

		// Simulate TipTap round-trip normalization (e.g., trimmed trailing newline)
		const normalized = "# Hello\n\nWorld";
		setDocumentCurrentContent(TEST_KEY, normalized);

		const isDirty =
			getDocumentCurrentContent(TEST_KEY) !==
			getDocumentBaselineContent(TEST_KEY);
		expect(isDirty).toBe(true);
	});

	test("no false dirty when content is unchanged", () => {
		const raw = "# Hello\n\nWorld\n";
		setDocumentLoadedContent(TEST_KEY, raw);

		// Content is not modified — should not be dirty
		const isDirty =
			getDocumentCurrentContent(TEST_KEY) !==
			getDocumentBaselineContent(TEST_KEY);
		expect(isDirty).toBe(false);
	});

	test("discardDocumentCurrentContent restores baseline", () => {
		const raw = "# Hello\n\nWorld\n";
		setDocumentLoadedContent(TEST_KEY, raw);

		const normalized = "# Hello\n\nWorld";
		setDocumentCurrentContent(TEST_KEY, normalized);

		const restored = discardDocumentCurrentContent(TEST_KEY);
		expect(restored).toBe(raw);
		expect(getDocumentCurrentContent(TEST_KEY)).toBe(raw);
	});
});
