/** Kept free of tRPC imports so these guards stay unit-testable: importing the
 * hook that uses them pulls in the renderer's tRPC client, which other test
 * files partially mock — and `mock.module` is process-global in Bun. */

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
