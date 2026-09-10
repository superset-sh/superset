/** Kept free of tRPC imports so these guards stay unit-testable: importing the
 * hook that uses them pulls in the renderer's tRPC client, which other test
 * files partially mock — and `mock.module` is process-global in Bun. */

import {
	type FileDiffLoadedFiles,
	type FileDiffMetadata,
	hydratePartialDiff,
} from "@pierre/diffs";

/** Ceiling on the file contents `loadDiffFiles` will pull in to expand a
 * partial diff. Parsing more than this on the main thread is the freeze the
 * Changes pane exists to avoid. */
const MAX_RENDERED_DIFF_CONTENT_CHARS = 500_000;

const GENERATED_FILE_PATTERNS = [
	/^bun\.lock(b)?$/,
	/^package-lock\.json$/,
	/^yarn\.lock$/,
	/^pnpm-lock\.yaml$/,
	/^composer\.lock$/,
	/^Gemfile\.lock$/,
	/^Cargo\.lock$/,
	/^poetry\.lock$/,
	/^Pipfile\.lock$/,
	/^go\.sum$/,
	/(^|[\\/])locales[\\/][^\\/]+[\\/]messages\.ts$/,
	/\.min\.(js|css)$/,
	/\.bundle\.(js|css)$/,
	/(^|[\\/])vendor[\\/]/,
	/(^|[\\/])node_modules[\\/]/,
	/(^|[\\/])dist[\\/]/,
	/(^|[\\/])build[\\/]/,
];

export function isGeneratedDiffFile(filePath: string): boolean {
	const fileName = filePath.split("/").pop() ?? filePath;
	return GENERATED_FILE_PATTERNS.some(
		(pattern) => pattern.test(fileName) || pattern.test(filePath),
	);
}

export function isDiffContentTooLarge(
	oldContents: string,
	newContents: string,
): boolean {
	return (
		oldContents.length + newContents.length > MAX_RENDERED_DIFF_CONTENT_CHARS
	);
}

/** Whether `files` was read at a different revision than the patch `fileDiff`
 * was parsed from. Hydration keeps the patch's hunks and swaps in whole-file
 * line arrays, so contents fetched after the file moved on leave the lines past
 * the last hunk uneven between the two sides. @pierre/diffs asserts they match
 * while it measures layout, and throws from a layout effect — which no boundary
 * inside the pane can catch, so the whole view goes down. Measured on a
 * throwaway clone: rejecting the load leaves the real metadata partial, still
 * rendering the hunks the patch already gave us. */
export function isDiffContentStale(
	fileDiff: FileDiffMetadata,
	files: FileDiffLoadedFiles,
): boolean {
	if (!fileDiff.isPartial) return false;
	let hydrated: FileDiffMetadata;
	try {
		hydrated = hydratePartialDiff("clone", fileDiff, files);
	} catch {
		// Contents this diff can't be hydrated from at all — a missing side for
		// its change type — are just as unusable as mismatched ones.
		return true;
	}
	const lastHunk = hydrated.hunks.at(-1);
	// Mirrors the cases @pierre/diffs itself skips before comparing.
	if (
		lastHunk == null ||
		hydrated.additionLines.length === 0 ||
		hydrated.deletionLines.length === 0
	) {
		return false;
	}
	const additionRemaining =
		hydrated.additionLines.length -
		getHunkSideEndBoundary(lastHunk.additionStart, lastHunk.additionCount);
	const deletionRemaining =
		hydrated.deletionLines.length -
		getHunkSideEndBoundary(lastHunk.deletionStart, lastHunk.deletionCount);
	if (additionRemaining <= 0 && deletionRemaining <= 0) return false;
	return additionRemaining !== deletionRemaining;
}

/** @pierre/diffs' own unified-hunk boundary math, which it doesn't export: a
 * zero-count side sits between two lines and consumes none of them. */
function getHunkSideEndBoundary(start: number, count: number): number {
	return start - (count === 0 ? 0 : 1) + count;
}
