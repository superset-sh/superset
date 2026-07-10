/**
 * Single source of truth for extension-based file classification shared by the
 * host-service git path and the desktop main/renderer code. Keeping these here
 * stops the two sides from drifting on questions like whether `.svg` counts as
 * binary (it does not — it is text and should stay diffable).
 */

/** Gets the file extension from a path (lowercase, without dot). */
export function getFileExtension(filePath: string): string {
	const fileName = filePath.split(/[\\/]/).pop() ?? filePath;
	const dotIndex = fileName.lastIndexOf(".");
	if (dotIndex <= 0 || dotIndex === fileName.length - 1) {
		return "";
	}
	return fileName.slice(dotIndex + 1).toLowerCase();
}

/**
 * Raster image extensions. Excludes `svg`, which is text: it renders as an
 * image but is better shown as a diff than hidden behind a binary placeholder.
 */
export const RASTER_IMAGE_EXTENSIONS: ReadonlySet<string> = new Set([
	"bmp",
	"gif",
	"ico",
	"jpeg",
	"jpg",
	"png",
	"tif",
	"tiff",
	"webp",
]);

/** Video container extensions. */
export const VIDEO_EXTENSIONS: ReadonlySet<string> = new Set([
	"3g2",
	"3gp",
	"avi",
	"m4v",
	"mkv",
	"mov",
	"mp4",
	"mpeg",
	"mpg",
	"ogv",
	"webm",
	"wmv",
]);

/**
 * Extensions that are always binary media (raster images + videos). These are
 * never diffable as text, so the changes pane shows a placeholder/preview
 * instead of attempting a line diff.
 */
export const BINARY_MEDIA_EXTENSIONS: ReadonlySet<string> = new Set([
	...RASTER_IMAGE_EXTENSIONS,
	...VIDEO_EXTENSIONS,
]);

/**
 * Number of leading bytes to sniff for NUL when deciding whether an untracked
 * file is binary, mirroring git's own heuristic.
 */
export const BINARY_SNIFF_BYTES = 8192;

/**
 * Checks if a file is a video based on extension. Covers all known video
 * extensions, not just browser-playable ones.
 */
export function isVideoFile(filePath: string): boolean {
	return VIDEO_EXTENSIONS.has(getFileExtension(filePath));
}

/**
 * Checks if a file is binary media (raster image or video) purely from its
 * extension, so a line diff is never attempted for it.
 */
export function isBinaryMediaFile(filePath: string): boolean {
	return BINARY_MEDIA_EXTENSIONS.has(getFileExtension(filePath));
}
