const REM_PER_CHAR = 0.5 * 0.75;
const PADDING_REM = 0.5;
const MAX_SLUG_LENGTH = 11; // "SUPER-XXXXX"

export function getSlugColumnWidth(slugs: string[]): string {
	if (slugs.length === 0) return "5rem";

	const longestLength = Math.min(
		slugs.reduce((max, slug) => Math.max(max, slug.length), 0),
		MAX_SLUG_LENGTH,
	);

	const width = longestLength * REM_PER_CHAR + PADDING_REM;
	return `${Math.ceil(width * 10) / 10}rem`;
}
