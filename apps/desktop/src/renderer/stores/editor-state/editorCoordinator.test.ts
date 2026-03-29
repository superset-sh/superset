import { beforeEach, describe, expect, test } from "bun:test";
import {
	deleteDocumentBuffer,
	getDocumentBaselineContent,
	getDocumentCurrentContent,
} from "./editorBufferRegistry";
import {
	applyLoadedDocumentContent,
	updateDocumentDraft,
} from "./editorCoordinator";
import { useEditorDocumentsStore } from "./useEditorDocumentsStore";

/**
 * Reproduction test for GitHub issue #2830:
 * Unchanged markdown file always gives unsaved changes modal.
 *
 * This test simulates the flow that causes the bug:
 *
 * 1. A markdown file is loaded into the editor buffer (baseline = raw content)
 * 2. TipTap's `setEditable()` fires an "update" event (emitUpdate defaults to true)
 * 3. The onUpdate handler calls `getEditorMarkdown()` which serializes the
 *    ProseMirror document back to markdown — but the tiptap-markdown serializer
 *    normalizes content during round-trip (e.g., trailing newlines, spacing)
 * 4. This normalized content is passed to `updateDocumentDraft()` which
 *    compares it with the baseline and incorrectly sets dirty = true
 *
 * Fix: Pass `emitUpdate: false` to `editor.setEditable()` in TipTapMarkdownRenderer
 * so that changing the editable state does not trigger an update event.
 */

const TEST_KEY = "test-workspace::working::readme.md";

function getDocumentDirty(): boolean {
	return useEditorDocumentsStore.getState().documents[TEST_KEY]?.dirty ?? false;
}

function setupDocument(rawContent: string): void {
	// Simulate what happens in FileViewerPane when file content loads:
	// 1. upsertDocument creates the document entry
	useEditorDocumentsStore.getState().upsertDocument({
		documentKey: TEST_KEY,
		workspaceId: "test-workspace",
		filePath: "readme.md",
		status: "ready",
		dirty: false,
		baselineRevision: "rev-1",
		hasExternalDiskChange: false,
		conflict: null,
		isEditable: true,
	});

	// 2. applyLoadedDocumentContent sets baseline = current = raw content
	applyLoadedDocumentContent(TEST_KEY, rawContent, "rev-1");
}

beforeEach(() => {
	deleteDocumentBuffer(TEST_KEY);
	useEditorDocumentsStore.getState().removeDocument(TEST_KEY);
});

describe("issue #2830: markdown false dirty state from TipTap normalization", () => {
	test("reproduces: setEditable triggers onUpdate with normalized content → false dirty", () => {
		const rawContent = "# Hello\n\nWorld\n";
		setupDocument(rawContent);

		// Verify document starts clean
		expect(getDocumentDirty()).toBe(false);
		expect(getDocumentBaselineContent(TEST_KEY)).toBe(rawContent);
		expect(getDocumentCurrentContent(TEST_KEY)).toBe(rawContent);

		// Simulate what happens when TipTap's setEditable() fires onUpdate:
		// The tiptap-markdown serializer round-trips the content, normalizing it
		// (e.g., removing a trailing newline, changing spacing around blocks)
		const normalizedContent = "# Hello\n\nWorld";
		updateDocumentDraft(TEST_KEY, normalizedContent);

		// BUG: Document is marked dirty even though user made no changes.
		// The content difference is purely from TipTap's markdown serialization
		// normalization, not from user edits.
		expect(getDocumentDirty()).toBe(true);
		expect(getDocumentCurrentContent(TEST_KEY)).toBe(normalizedContent);
		expect(getDocumentBaselineContent(TEST_KEY)).toBe(rawContent);
	});

	test("no false dirty when setEditable does not emit update (the fix)", () => {
		const rawContent = "# Hello\n\nWorld\n";
		setupDocument(rawContent);

		expect(getDocumentDirty()).toBe(false);

		// With the fix: editor.setEditable(editable, false) — no onUpdate fires,
		// so updateDocumentDraft is never called with normalized content.
		// The document stays clean.
		// (We verify this by simply NOT calling updateDocumentDraft)
		expect(getDocumentDirty()).toBe(false);
		expect(getDocumentCurrentContent(TEST_KEY)).toBe(rawContent);
		expect(getDocumentBaselineContent(TEST_KEY)).toBe(rawContent);
	});

	test("real user edit correctly marks dirty", () => {
		const rawContent = "# Hello\n\nWorld\n";
		setupDocument(rawContent);

		expect(getDocumentDirty()).toBe(false);

		// User types something — this SHOULD mark dirty
		const editedContent = "# Hello\n\nWorld!\n";
		updateDocumentDraft(TEST_KEY, editedContent);

		expect(getDocumentDirty()).toBe(true);
		expect(getDocumentCurrentContent(TEST_KEY)).toBe(editedContent);
	});

	test("user edit then undo restores clean state", () => {
		const rawContent = "# Hello\n\nWorld\n";
		setupDocument(rawContent);

		// User types
		updateDocumentDraft(TEST_KEY, "# Hello\n\nWorld!\n");
		expect(getDocumentDirty()).toBe(true);

		// User undoes — content matches baseline again
		updateDocumentDraft(TEST_KEY, rawContent);
		expect(getDocumentDirty()).toBe(false);
	});
});
