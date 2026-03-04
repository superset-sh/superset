/**
 * Shared file type detection utilities.
 * Used by both main and renderer processes.
 */

/** Supported image extensions */
const IMAGE_EXTENSIONS = new Set([
	"png",
	"jpg",
	"jpeg",
	"gif",
	"webp",
	"svg",
	"bmp",
	"ico",
]);

/** MIME types for supported image extensions */
const IMAGE_MIME_TYPES: Record<string, string> = {
	png: "image/png",
	jpg: "image/jpeg",
	jpeg: "image/jpeg",
	gif: "image/gif",
	webp: "image/webp",
	svg: "image/svg+xml",
	bmp: "image/bmp",
	ico: "image/x-icon",
};

/** Markdown extensions */
const MARKDOWN_EXTENSIONS = new Set(["md", "markdown", "mdx"]);

/**
 * Gets the file extension from a path (lowercase, without dot)
 */
function getExtension(filePath: string): string {
	return filePath.split(".").pop()?.toLowerCase() ?? "";
}

/**
 * Checks if a file is an image based on extension
 */
export function isImageFile(filePath: string): boolean {
	return IMAGE_EXTENSIONS.has(getExtension(filePath));
}

/**
 * Gets the MIME type for an image file
 * Returns null if not a supported image type
 */
export function getImageMimeType(filePath: string): string | null {
	const ext = getExtension(filePath);
	return IMAGE_MIME_TYPES[ext] ?? null;
}

/**
 * Checks if a file is markdown based on extension
 */
export function isMarkdownFile(filePath: string): boolean {
	return MARKDOWN_EXTENSIONS.has(getExtension(filePath));
}

/**
 * Checks if a file supports rendered preview (markdown or image)
 */
export function hasRenderedPreview(filePath: string): boolean {
	return isMarkdownFile(filePath) || isImageFile(filePath);
}
