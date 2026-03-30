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

/** Extensions for supported image MIME types */
const IMAGE_MIME_TYPE_EXTENSIONS: Record<string, string> = {
	"image/png": "png",
	"image/jpeg": "jpg",
	"image/jpg": "jpg",
	"image/gif": "gif",
	"image/webp": "webp",
	"image/svg+xml": "svg",
	"image/bmp": "bmp",
	"image/x-icon": "ico",
	"image/vnd.microsoft.icon": "ico",
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
 * Gets the preferred file extension for an image MIME type.
 * Returns null if not a supported image type.
 */
export function getImageExtensionFromMimeType(mimeType: string): string | null {
	return IMAGE_MIME_TYPE_EXTENSIONS[mimeType.toLowerCase()] ?? null;
}

/**
 * Parses a base64 data URL and returns its MIME type and base64 payload.
 */
export function parseBase64DataUrl(dataUrl: string): {
	base64Data: string;
	mimeType: string;
} {
	const separatorIndex = dataUrl.indexOf(",");
	if (separatorIndex === -1) {
		throw new Error("Invalid data URL format");
	}

	const header = dataUrl.slice(0, separatorIndex);
	const base64Data = dataUrl.slice(separatorIndex + 1);
	const mimeMatch = header.match(/^data:([^;,]+)(?:;[^,]*)*;base64$/i);
	const mimeType = mimeMatch?.[1]?.toLowerCase();

	if (!mimeType) {
		throw new Error("Invalid data URL format");
	}

	return { base64Data, mimeType };
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
