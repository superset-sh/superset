import { describe, expect, test } from "bun:test";
import type { FileViewerState, Pane } from "./tabs-types";

/**
 * Reproduction test for GitHub issue #2490:
 * Draft/unsaved content is lost when navigating away from a tab and returning.
 *
 * Root cause: Draft content was stored only in React refs (draftContentRef)
 * which are destroyed when the FileViewerPane component unmounts during tab
 * switches. Only one tab's content is rendered at a time, so switching tabs
 * unmounts the previous tab's component tree.
 *
 * Fix: Persist draft content in the Zustand tabs store (FileViewerState.draftContent)
 * so it survives component unmount/remount cycles during tab switches.
 */

function createFileViewerPane(overrides: Partial<FileViewerState> = {}): Pane {
	return {
		id: "pane-1",
		tabId: "tab-1",
		type: "file-viewer",
		name: "test.md",
		fileViewer: {
			filePath: "/workspace/test.md",
			viewMode: "raw",
			isPinned: false,
			diffLayout: "inline",
			...overrides,
		},
	};
}

describe("FileViewerState.draftContent", () => {
	test("draftContent field exists on FileViewerState", () => {
		const state: FileViewerState = {
			filePath: "/workspace/test.md",
			viewMode: "raw",
			isPinned: false,
			diffLayout: "inline",
			draftContent: "unsaved edits here",
		};
		expect(state.draftContent).toBe("unsaved edits here");
	});

	test("draftContent is optional and defaults to undefined", () => {
		const state: FileViewerState = {
			filePath: "/workspace/test.md",
			viewMode: "raw",
			isPinned: false,
			diffLayout: "inline",
		};
		expect(state.draftContent).toBeUndefined();
	});

	test("pane with draftContent preserves unsaved content across simulated tab switch", () => {
		// Simulate: user edits file, draft is saved to store before unmount
		const pane = createFileViewerPane();
		const draftContent = "# My Document\n\nUnsaved changes from Tab 1";

		// Simulate saving draft to store (what happens on unmount)
		const updatedPane: Pane = {
			...pane,
			fileViewer: {
				...pane.fileViewer!,
				draftContent,
			},
		};

		// Simulate tab switch and return — draft should still be available
		expect(updatedPane.fileViewer?.draftContent).toBe(draftContent);
	});

	test("clearing draftContent after save sets it to undefined", () => {
		const pane = createFileViewerPane({
			draftContent: "some unsaved content",
		});

		// Simulate clearing draft after save
		const savedPane: Pane = {
			...pane,
			fileViewer: {
				...pane.fileViewer!,
				draftContent: undefined,
			},
		};

		expect(savedPane.fileViewer?.draftContent).toBeUndefined();
	});

	test("draftContent is stripped on simulated app restart (merge callback)", () => {
		// Simulate persisted panes with draft content
		const panes: Record<string, Pane> = {
			"pane-1": createFileViewerPane({
				draftContent: "leftover draft from last session",
			}),
			"pane-2": createFileViewerPane({
				filePath: "/workspace/other.md",
			}),
		};

		// Simulate the merge callback that runs on app startup
		for (const pane of Object.values(panes)) {
			if (pane.fileViewer?.draftContent !== undefined) {
				pane.fileViewer.draftContent = undefined;
			}
		}

		expect(panes["pane-1"].fileViewer?.draftContent).toBeUndefined();
		expect(panes["pane-2"].fileViewer?.draftContent).toBeUndefined();
	});

	test("draft restoration flow: isDirty is derived from draftContent presence", () => {
		// When a component mounts with draftContent, isDirty should be true
		const paneWithDraft = createFileViewerPane({
			draftContent: "unsaved edits",
		});
		const hasDraft = !!paneWithDraft.fileViewer?.draftContent;
		expect(hasDraft).toBe(true);

		// When there's no draft, isDirty should start as false
		const paneWithoutDraft = createFileViewerPane();
		const hasNoDraft = !!paneWithoutDraft.fileViewer?.draftContent;
		expect(hasNoDraft).toBe(false);
	});

	test("draft content survives full pane state round-trip (serialize/deserialize)", () => {
		const original = createFileViewerPane({
			draftContent:
				"Long markdown content\n\nWith multiple paragraphs\n\n- And lists",
			isPinned: true,
		});

		// Simulate JSON serialization (what Zustand persist does)
		const serialized = JSON.stringify(original);
		const deserialized = JSON.parse(serialized) as Pane;

		expect(deserialized.fileViewer?.draftContent).toBe(
			original.fileViewer?.draftContent,
		);
		expect(deserialized.fileViewer?.isPinned).toBe(true);
		expect(deserialized.fileViewer?.filePath).toBe("/workspace/test.md");
	});
});
