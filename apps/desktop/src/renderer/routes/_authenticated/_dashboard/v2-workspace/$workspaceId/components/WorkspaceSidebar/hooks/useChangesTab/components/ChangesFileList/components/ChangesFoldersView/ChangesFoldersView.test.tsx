/**
 * Reproduction for #5300 — "Changes tab causes terminal input lag with large
 * change sets".
 *
 * Root cause: the Changes tab materializes one row per changed file with no
 * windowing/virtualization. With ~1846 changes that mounts thousands of rows
 * (each `FileRow` wraps Radix Tooltip + ContextMenu + DropdownMenu, attaching
 * document-level listeners), which contends with the terminal on the renderer
 * main thread. The Files tab does not lag because it is virtualized and only
 * mounts the visible rows.
 *
 * This test renders `ChangesFoldersView` with a large changeset and counts how
 * many `FileRow`s are actually mounted. `FileRow` and `FolderHeader` are mocked
 * to lightweight markers so we isolate the windowing behaviour from their
 * (heavy) real implementations.
 *
 * The test asserts the *desired* behaviour — a large change set should mount a
 * bounded number of rows — so it currently FAILS, demonstrating the bug.
 */
import { afterAll, expect, mock, test } from "bun:test";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { ChangesetFile } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/useChangeset";

// Mock the heavy children with cheap markers. Relative specifiers match the
// ones `ChangesFoldersView.tsx` itself imports (it lives in this directory),
// so the module registry override intercepts the real imports.
mock.module("../FileRow", () => ({
	FileRow: ({ file }: { file: ChangesetFile }) =>
		h("div", { "data-testid": "file-row", "data-path": file.path }),
}));
mock.module("./components/FolderHeader", () => ({
	FolderHeader: ({ label }: { label: string }) =>
		h("div", { "data-testid": "folder-header", "data-label": label }),
}));

const { ChangesFoldersView } = await import("./ChangesFoldersView");

afterAll(() => {
	mock.restore();
});

function makeFiles(count: number): ChangesetFile[] {
	const files: ChangesetFile[] = [];
	for (let i = 0; i < count; i++) {
		// Spread across folders the way a real worktree would be.
		const folder = `src/feature-${i % 50}/sub-${i % 7}`;
		files.push({
			path: `${folder}/file-${i}.ts`,
			status: "modified",
			additions: 1,
			deletions: 0,
			source: { kind: "against-base", baseBranch: "main" },
		});
	}
	return files;
}

function countRows(html: string): number {
	return (html.match(/data-testid="file-row"/g) ?? []).length;
}

test("renders a bounded number of rows for a large change set (repro #5300)", () => {
	// The reporter saw the lag at 1846 changes against base.
	const files = makeFiles(1846);

	const html = renderToStaticMarkup(
		h(ChangesFoldersView, {
			files,
			workspaceId: "ws-1",
			foldSignal: { epoch: 0, action: "expand" },
		}),
	);

	const rowsMounted = countRows(html);

	// A virtualized/windowed list would mount only a small, viewport-sized
	// slice regardless of how many files changed. Today the Changes tab mounts
	// one row per change, so this is 1846 — far above any sane window — and the
	// thousands of resulting Radix overlay subtrees contend with the terminal.
	const WINDOW_CAP = 200;
	expect(rowsMounted).toBeLessThanOrEqual(WINDOW_CAP);
});
