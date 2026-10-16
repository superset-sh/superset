import { describe, expect, it, mock } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import type { ChangedFile } from "shared/changes-types";

mock.module("renderer/lib/electron-trpc", () => ({
	electronTrpc: {
		createClient: () => ({}),
		external: {
			openInFinder: { useMutation: () => ({ mutate: () => {} }) },
			openInApp: { useMutation: () => ({ mutate: () => {} }) },
			openFileInEditor: { useMutation: () => ({ mutate: () => {} }) },
		},
	},
}));

const { ScrollProvider } = await import("../../../../ChangesContent");
const { FileItem } = await import("../FileItem");
const { FolderRow } = await import("../FolderRow");

const GUIDE_PATTERN = /<div class="[^"]*\bborder-r\b[^"]*"/;

/** Class strings of the vertical indent guides drawn by a row, left to right. */
function indentGuideClasses(markup: string): string[] {
	return [...markup.matchAll(/<div class="([^"]*\bborder-r\b[^"]*)"/g)].map(
		(match) => match[1] as string,
	);
}

/** Everything the row renders before its first indent guide. */
function markupBeforeFirstGuide(markup: string): string {
	const index = markup.search(GUIDE_PATTERN);
	return index === -1 ? markup : markup.slice(0, index);
}

const file: ChangedFile = {
	path: "apps/desktop/index.ts",
	status: "modified",
	additions: 3,
	deletions: 1,
};

function renderFileRow(level: number) {
	return renderToStaticMarkup(
		<ScrollProvider>
			<FileItem
				file={file}
				isSelected={false}
				onClick={() => {}}
				level={level}
				worktreePath="/tmp/worktree"
			/>
		</ScrollProvider>,
	);
}

function renderFolderRow(level: number) {
	return renderToStaticMarkup(
		<FolderRow
			name="desktop"
			isExpanded={true}
			onToggle={() => {}}
			level={level}
			variant="tree"
			folderPath="apps/desktop"
			worktreePath="/tmp/worktree"
		>
			{null}
		</FolderRow>,
	);
}

describe("changes tree indent guides", () => {
	it("draws identical guides for folder and file rows at the same level", () => {
		const folderGuides = indentGuideClasses(renderFolderRow(2));
		const fileGuides = indentGuideClasses(renderFileRow(2));

		expect(fileGuides).toHaveLength(2);
		expect(folderGuides).toEqual(fileGuides);
	});

	it("starts the guides at the row's left edge, before the folder chevron", () => {
		const beforeFolderGuide = markupBeforeFirstGuide(renderFolderRow(2));
		const beforeFileGuide = markupBeforeFirstGuide(renderFileRow(2));

		// A chevron (or any other content) ahead of the guides shifts a folder's
		// guides right relative to the file rows nested under it.
		expect(beforeFolderGuide).not.toContain("<svg");
		expect(beforeFileGuide).not.toContain("<svg");
	});

	it("lets the guides span the full row height in both row types", () => {
		// Vertical padding on an ancestor of the guides shortens them, so the
		// guide column breaks up between rows instead of reading as one line.
		expect(markupBeforeFirstGuide(renderFolderRow(2))).not.toMatch(
			/class="[^"]*\bpy-/,
		);
		expect(markupBeforeFirstGuide(renderFileRow(2))).not.toMatch(
			/class="[^"]*\bpy-/,
		);
	});

	it("draws no guides at the tree root", () => {
		expect(indentGuideClasses(renderFolderRow(0))).toEqual([]);
		expect(indentGuideClasses(renderFileRow(0))).toEqual([]);
	});
});
