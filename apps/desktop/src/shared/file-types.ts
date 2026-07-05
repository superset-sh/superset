/**
 * Shared file type detection utilities.
 * Used by both main and renderer processes.
 */

import { getFileExtension, isVideoFile } from "@superset/shared/media-files";

// Re-exported so renderer/main code can keep importing extension helpers from
// `shared/file-types`; the canonical definitions live in `@superset/shared`.
export { getFileExtension, isVideoFile };

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
	"tif",
	"tiff",
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
	tif: "image/tiff",
	tiff: "image/tiff",
};

/** Browser-playable video extensions */
const PREVIEWABLE_VIDEO_EXTENSIONS = new Set([
	"m4v",
	"mov",
	"mp4",
	"ogv",
	"webm",
]);

/** MIME types for supported video extensions */
const VIDEO_MIME_TYPES: Record<string, string> = {
	mp4: "video/mp4",
	m4v: "video/mp4",
	mov: "video/quicktime",
	ogv: "video/ogg",
	webm: "video/webm",
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
	"image/tiff": "tiff",
	"image/x-icon": "ico",
	"image/vnd.microsoft.icon": "ico",
};

/** Markdown extensions */
const MARKDOWN_EXTENSIONS = new Set(["md", "markdown", "mdx"]);

/**
 * Checks if a file is an image based on extension
 */
export function isImageFile(filePath: string): boolean {
	return IMAGE_EXTENSIONS.has(getFileExtension(filePath));
}

/**
 * Gets the MIME type for an image file
 * Returns null if not a supported image type
 */
export function getImageMimeType(filePath: string): string | null {
	const ext = getFileExtension(filePath);
	return IMAGE_MIME_TYPES[ext] ?? null;
}

/**
 * Checks if a video file can be previewed by the browser video element.
 */
export function isPreviewableVideoFile(filePath: string): boolean {
	return PREVIEWABLE_VIDEO_EXTENSIONS.has(getFileExtension(filePath));
}

/**
 * Gets the MIME type for a video file
 * Returns null if not a supported video type
 */
export function getVideoMimeType(filePath: string): string | null {
	const ext = getFileExtension(filePath);
	return VIDEO_MIME_TYPES[ext] ?? null;
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
	return MARKDOWN_EXTENSIONS.has(getFileExtension(filePath));
}

/**
 * Checks if a file supports rendered preview (markdown or image)
 */
export function hasRenderedPreview(filePath: string): boolean {
	return isMarkdownFile(filePath) || isImageFile(filePath);
}
